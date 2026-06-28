import pytest
from app.validator.ceisa_rules import validate

def make_field(value, confidence=0.95):
    return {"value": value, "confidence": confidence}

def test_valid_declaration():
    extracted = {
        "hs_code":           make_field("8471300000"),
        "consignee":         make_field("PT TEST"),
        "declared_value":    make_field(5000.0),
        "currency":          make_field("USD"),
        "quantity":          make_field(10),
        "unit":              make_field("PCS"),
        "description":       make_field("Laptop Computer"),
        "country_of_origin": make_field("China"),
    }
    result = validate(extracted)
    assert result["valid"] == True
    assert len(result["errors"]) == 0

def test_invalid_hs_code():
    extracted = {
        "hs_code":           make_field("12345"),  # only 5 digits
        "consignee":         make_field("PT TEST"),
        "declared_value":    make_field(5000.0),
        "currency":          make_field("USD"),
        "quantity":          make_field(10),
        "unit":              make_field("PCS"),
        "description":       make_field("Laptop"),
        "country_of_origin": make_field("China"),
    }
    result = validate(extracted)
    assert result["valid"] == False
    assert any("HS Code" in e for e in result["errors"])

def test_missing_mandatory_field():
    extracted = {
        "hs_code": make_field("8471300000"),
        # consignee missing
        "declared_value":    make_field(5000.0),
        "currency":          make_field("USD"),
        "quantity":          make_field(10),
        "unit":              make_field("PCS"),
        "description":       make_field("Laptop"),
        "country_of_origin": make_field("China"),
    }
    result = validate(extracted)
    assert result["valid"] == False
    assert "consignee" in result["flagged_fields"]

def test_low_confidence_generates_warning():
    extracted = {
        "hs_code":           make_field("8471300000", confidence=0.50),
        "consignee":         make_field("PT TEST"),
        "declared_value":    make_field(5000.0),
        "currency":          make_field("USD"),
        "quantity":          make_field(10),
        "unit":              make_field("PCS"),
        "description":       make_field("Laptop"),
        "country_of_origin": make_field("China"),
    }
    result = validate(extracted)
    assert len(result["warnings"]) > 0
    assert "hs_code" in result["flagged_fields"]

def test_negative_declared_value():
    extracted = {
        "hs_code":           make_field("8471300000"),
        "consignee":         make_field("PT TEST"),
        "declared_value":    make_field(-100),
        "currency":          make_field("USD"),
        "quantity":          make_field(10),
        "unit":              make_field("PCS"),
        "description":       make_field("Laptop"),
        "country_of_origin": make_field("China"),
    }
    result = validate(extracted)
    assert result["valid"] == False
