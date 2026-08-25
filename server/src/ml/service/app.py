# -*- coding: utf-8 -*-
"""Smart Academy - Recommendation ML microservice.

Serves the trained Random Forest recommender (random_forest_recommender.pkl)
produced by smart_recommendation.ipynb. The model is loaded once at startup and
never retrained here.

Preprocessing mirrors the notebook exactly:
- Numeric features: click_count, repeated_interaction, latest_quiz_score,
  previous_quiz_score, score_change, interaction_week
- activity_type is one-hot encoded into activity_type_* columns using the
  exact column set and order stored in model_features.pkl
- Missing features are filled with 0 and the row is reindexed to the exact
  training column order (the notebook's reindex(columns=X_train.columns))
- REWATCH is predicted when predict_proba(...)[:, 1] >= 0.5, otherwise
  NEXT_VIDEO (notebook threshold, never modified)
"""

from __future__ import annotations

import json
import os
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = Path(os.getenv("MODEL_PATH", MODELS_DIR / "random_forest_recommender.pkl"))
FEATURES_PATH = Path(os.getenv("FEATURES_PATH", MODELS_DIR / "model_features.pkl"))

PREDICTION_THRESHOLD = 0.5


class PredictRequest(BaseModel):
    click_count: int = Field(ge=0)
    repeated_interaction: int = Field(ge=0, le=1)
    latest_quiz_score: float = Field(ge=0)
    previous_quiz_score: float = Field(ge=0)
    score_change: float
    interaction_week: int = Field(ge=0)
    activity_type: str


class ModelStore:
    """Holds the loaded model and exact feature list."""

    def __init__(self) -> None:
        self.model: object | None = None
        self.features: list[str] = []
        self.activity_types: list[str] = []

    def load(self) -> None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model file not found: {MODEL_PATH}")
        if not FEATURES_PATH.exists():
            raise RuntimeError(f"Features file not found: {FEATURES_PATH}")

        self.model = joblib.load(MODEL_PATH)
        self.features = list(joblib.load(FEATURES_PATH))
        self.activity_types = sorted(
            {
                column.replace("activity_type_", "")
                for column in self.features
                if column.startswith("activity_type_")
            }
        )

        unknown = [column for column in self.features if column not in self.expected_columns()]
        if unknown:
            raise RuntimeError(f"Unexpected model features: {unknown}")

    def expected_columns(self) -> list[str]:
        return [
            "click_count",
            "repeated_interaction",
            "latest_quiz_score",
            "previous_quiz_score",
            "score_change",
            "interaction_week",
        ] + [f"activity_type_{name}" for name in self.activity_types]

    def recommend_next_action(
        self,
        click_count: int,
        repeated_interaction: int,
        latest_quiz_score: float,
        previous_quiz_score: float,
        score_change: float,
        interaction_week: int,
        activity_type: str,
    ) -> dict:
        # Identical feature construction to the notebook's recommend_next_action.
        user_input = pd.DataFrame(
            [
                {
                    "click_count": click_count,
                    "repeated_interaction": repeated_interaction,
                    "latest_quiz_score": latest_quiz_score,
                    "previous_quiz_score": previous_quiz_score,
                    "score_change": score_change,
                    "interaction_week": interaction_week,
                }
            ]
        )

        # Create activity columns exactly like the notebook.
        for column in self.features:
            if column.startswith("activity_type_"):
                activity = column.replace("activity_type_", "")
                user_input[column] = int(activity == activity_type)

        # Make sure feature order is identical to training.
        user_input = user_input.reindex(columns=self.features, fill_value=0)

        probability = self.model.predict_proba(user_input)[0][1]
        prediction = int(probability >= PREDICTION_THRESHOLD)

        return {
            "recommendation": "REWATCH" if prediction == 1 else "NEXT_VIDEO",
            "rewatch_probability": round(float(probability), 4),
            "prediction": prediction,
        }


store = ModelStore()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    store.load()
    yield


app = FastAPI(
    title="Smart Academy Recommendation ML Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/")
def root() -> dict:
    return {"service": "smart-academy-ml", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": store.model is not None,
        "features": len(store.features),
    }


@app.get("/features")
def features() -> dict:
    if store.model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    return {
        "features": store.features,
        "feature_count": len(store.features),
        "activity_types": store.activity_types,
        "threshold": PREDICTION_THRESHOLD,
    }


@app.post("/predict")
def predict(request: PredictRequest) -> dict:
    if store.model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    if request.activity_type not in store.activity_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown activity_type '{request.activity_type}'. "
            f"Supported: {json.dumps(sorted(store.activity_types))}",
        )

    result = store.recommend_next_action(
        click_count=request.click_count,
        repeated_interaction=request.repeated_interaction,
        latest_quiz_score=request.latest_quiz_score,
        previous_quiz_score=request.previous_quiz_score,
        score_change=request.score_change,
        interaction_week=request.interaction_week,
        activity_type=request.activity_type,
    )
    result["model_features"] = store.features
    return result