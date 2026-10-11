"""Optional independent JSON Schema proof; no ReDown runtime dependency.

Usage: python tests/debug-schema-conformance.py [generated-results.json]
Requires jsonschema 4.x. Never fetches remote schemas.
"""
import copy
import json
import sys
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
schema_dir = ROOT / "agent/debug/schemas/0.1"
schemas = {}
registry = Registry()
for path in sorted(schema_dir.glob("*.schema.json")):
    schema = json.loads(path.read_text())
    Draft202012Validator.check_schema(schema)
    schemas[path.name.removesuffix(".schema.json")] = schema
    registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))

def validate(name, value):
    return not list(Draft202012Validator(schemas[name], registry=registry).iter_errors(value))

count = 0
for row in json.loads((ROOT / "tests/fixtures/debug/structure-cases.json").read_text()):
    assert validate(row["schema"], row["value"]) == row["valid"], row["name"]
    count += 1

# Validate live and frozen old-version records independently.
for manifest_path in ["debug/manifest.json", "tests/fixtures/debug/v0.1/manifest.json"]:
    manifest = json.loads((ROOT / manifest_path).read_text())
    assert validate("manifest", manifest)
    count += 1
    for entry in manifest["cases"]:
        incident = json.loads((ROOT / entry["incidentPath"]).read_text())
        assert validate("incident", incident)
        count += 1
        for line in (ROOT / entry["historyPath"]).read_text().splitlines():
            event = json.loads(line)
            assert validate("event", event)
            count += 1

# Representative constraint boundaries and extensibility compare independently.
golden = json.loads((ROOT / "tests/fixtures/debug/v0.1/expected.json").read_text())
incident, event = golden["incident"], golden["latestEvents"][0]
mutations = [
    ("incident", incident, "provenance", None),
    ("incident", incident, "fingerprints", []),
    ("incident", incident, "unknowns", ["duplicate", "duplicate"]),
    ("incident", incident, "initialState", "closed"),
    ("event", event, "sequence", 1.5),
    ("event", event, "recordedAt", "yesterday"),
    ("event", event, "evidenceStatus", "accepted"),
    ("event", event, "sourceRefs", [{"path":"x", "symbol":"x", "role":"source", "sha256":"bad"}]),
]
for name, original, key, value in mutations:
    altered = copy.deepcopy(original)
    altered[key] = value
    assert not validate(name, altered), (name, key)
    count += 1

if len(sys.argv) > 1:
    generated = json.loads(Path(sys.argv[1]).read_text())
    for row in generated["structures"]:
        assert validate(row["schema"], row["value"]) == row["valid"], row["name"]
        count += 1
    for result in generated["results"]:
        assert validate("result", result)
        count += 1
print(f"Independent JSON Schema: {len(schemas)} schemas valid; {count} record/result/constraint checks passed.")
