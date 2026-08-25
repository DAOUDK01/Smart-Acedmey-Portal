# Smart Academy - Recommendation ML Service

Small FastAPI microservice that wraps the trained Random Forest recommender.
The model and feature list are loaded **once at startup** and never retrained.

## Model files

The service loads (defaults, overridable via `MODEL_PATH` / `FEATURES_PATH`):

- `models/random_forest_recommender.pkl` - the trained `RandomForestClassifier`
- `models/model_features.pkl` - the exact 26-column training feature list

## Run

```bash
cd server/src/ml/service
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8005
```

## Endpoints

| Method | Path        | Description                                                     |
| ------ | ----------- | --------------------------------------------------------------- |
| GET    | `/health`   | Liveness + whether the model is loaded                          |
| GET    | `/features` | Exact model feature list (in training order) and threshold      |
| POST   | `/predict`  | Predict REWATCH / NEXT_VIDEO from the raw notebook-level inputs |

`POST /predict` body:

```json
{
  "click_count": 10,
  "repeated_interaction": 1,
  "latest_quiz_score": 45,
  "previous_quiz_score": 55,
  "score_change": -10,
  "interaction_week": 4,
  "activity_type": "resource"
}
```

Response mirrors the notebook's `recommend_next_action`:

```json
{
  "recommendation": "REWATCH",
  "rewatch_probability": 0.7838,
  "prediction": 1,
  "model_features": ["click_count", "..."]
}
```

## Tests

```bash
cd server/src/ml/service
pytest tests -v
```

The expected probabilities in the tests are copied from the notebook's own
printed outputs (GROUP 27 / GROUP 30) and reproduce exactly.

## Notes

- The notebook function signature includes `interaction_month`, but the saved
  model has no such feature - it is dropped by the notebook's own
  `reindex(columns=X_train.columns)`. The service intentionally omits it.
- Prediction uses the notebook's original `>= 0.5` probability threshold for
  the REWATCH class; it is never changed.
- `scikit-learn` is pinned to `1.6.1` because the pickle was produced with
  that version (avoids `InconsistentVersionWarning`).
