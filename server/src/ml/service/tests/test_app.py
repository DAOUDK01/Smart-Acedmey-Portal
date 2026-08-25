# -*- coding: utf-8 -*-
"""Tests for the Smart Academy recommendation ML service.

Expected values are taken verbatim from the notebook's own test runs
(smart_recommendation.ipynb, GROUP 27 and GROUP 30).
"""

import joblib
import pytest
from fastapi.testclient import TestClient

from app import app

EXPECTED_FEATURES = list(joblib.load("../models/model_features.pkl"))

# Notebook GROUP 27 - REWATCH expected
G27 = {
    "click_count": 10,
    "repeated_interaction": 1,
    "latest_quiz_score": 45,
    "previous_quiz_score": 55,
    "score_change": -10,
    "interaction_week": 4,
    "activity_type": "resource",
}

# Notebook GROUP 30 - Student 1 (REWATCH) and Student 2 (NEXT_VIDEO)
S1 = {
    "click_count": 15,
    "repeated_interaction": 1,
    "latest_quiz_score": 40,
    "previous_quiz_score": 55,
    "score_change": -15,
    "interaction_week": 4,
    "activity_type": "resource",
}

S2 = {
    "click_count": 3,
    "repeated_interaction": 0,
    "latest_quiz_score": 85,
    "previous_quiz_score": 80,
    "score_change": 5,
    "interaction_week": 4,
    "activity_type": "resource",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert body["features"] == 26


def test_features_exact_order(client):
    response = client.get("/features")
    assert response.status_code == 200
    body = response.json()
    assert body["features"] == EXPECTED_FEATURES
    assert len(body["features"]) == 26
    assert body["features"][:6] == [
        "click_count",
        "repeated_interaction",
        "latest_quiz_score",
        "previous_quiz_score",
        "score_change",
        "interaction_week",
    ]
    assert all(f.startswith("activity_type_") for f in body["features"][6:])
    assert body["threshold"] == 0.5


@pytest.mark.parametrize(
    "payload,expected_probability,expected_recommendation",
    [
        (G27, 0.7838, "REWATCH"),
        (S1, 0.7482, "REWATCH"),
        (S2, 0.1561, "NEXT_VIDEO"),
    ],
)
def test_predict_matches_notebook(client, payload, expected_probability, expected_recommendation):
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["recommendation"] == expected_recommendation
    assert body["rewatch_probability"] == expected_probability
    assert body["model_features"] == EXPECTED_FEATURES


def test_predict_rejects_unknown_activity_type(client):
    payload = {**S2, "activity_type": "not_a_real_type"}
    response = client.post("/predict", json=payload)
    assert response.status_code == 400
    assert "Unknown activity_type" in response.json()["detail"]


def test_predict_validates_inputs(client):
    payload = {**S2, "repeated_interaction": 5}
    response = client.post("/predict", json=payload)
    assert response.status_code == 422