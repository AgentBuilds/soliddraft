# SolidDraft API

Base URL: `http://127.0.0.1:3000/api`. All dimensions are millimetres.
Writes accept `Content-Type: application/json` and at most 64 KiB. Responses
are JSON except the empty `204` delete response. GET routes also support HEAD.
No CORS headers are enabled; this API and the frontend share one origin.
This local MVP has no authentication. Keep it bound to loopback.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| GET | `/health` | `200 {status, service, version}`; verifies database access |
| GET | `/templates` | `200 {templates, units}` |
| GET | `/templates/:id` | `200 {template, units}` |
| POST | `/templates/:id/validate` | `200 {templateId, templateVersion, parameters, units}` |
| GET | `/projects` | `200 {projects, total, limit, offset}` |
| POST | `/projects` | `201 {project}` and Location header; creates revision 1 atomically |
| GET | `/projects/:id` | `200 {project}` including latestRevision |
| PATCH | `/projects/:id` | `200 {project}`; renames a project |
| DELETE | `/projects/:id` | `204`; permanently deletes the project and its revisions |
| GET | `/projects/:id/revisions` | `200 {revisions, total, limit, offset}` |
| POST | `/projects/:id/revisions` | `201 {revision}` and Location header |
| GET | `/projects/:id/revisions/:revisionId` | `200 {revision}` scoped to that project |

List routes accept `limit` (1–100, default 50) and `offset` (non-negative safe
integer, default 0). Duplicate or unknown list query parameters return `400`.
Projects sort by updatedAt descending, then id; revisions sort by number descending.
Unknown resources return `404`; unsupported methods return `405` with Allow.

## Template validation

Each template exposes version `1` and a parameters object describing every field's
label, default, min, max and unit. Numbers must be finite JSON numbers, never strings.
Unknown fields are rejected. Missing parameters use the template defaults. For example:

```json
POST /api/templates/bracket/validate
{"parameters":{"width":50,"thickness":4}}
```

The normalized result includes every parameter. Cross-field checks also ensure:

- Bracket thickness is less than half of either leg; nonzero screw holes leave
  more than a thickness of material on each side. A zero diameter means no holes.
  Equality is rejected even for decimal dimensions: width `14.4`, thickness `1.4`
  and holeDiameter `11.6` do not leave the required extra clearance.
- Enclosure walls leave positive inner width/depth and cavity height. The template
  is open at the top; wallThickness also defines the floor thickness.
- Spacer inner/outer diameters leave at least 1 mm radial wall thickness. Zero
  inner diameter gives a solid cylindrical spacer.

These are parameter geometry guards for future trusted renderers. They do not
certify mechanical strength, printability or rendered meshes.

## Create a saved part

```json
POST /api/projects
{
  "name": "Shelf support",
  "templateId": "bracket",
  "description": "A bracket for a small shelf",
  "parameters": {"width":50}
}
```

name and templateId are required non-empty strings. name allows 120 characters;
description is optional, defaults to an empty string, and allows 4000 characters.
Text is trimmed. parameters is optional and defaults to the template's defaults.
Null values and unknown request fields are rejected. A project fixes its template
for all revisions. Selecting another template means creating another project.

```json
{
  "project": {
    "id": "<UUID>",
    "name": "Shelf support",
    "templateId": "bracket",
    "createdAt": "<UTC ISO timestamp>",
    "updatedAt": "<UTC ISO timestamp>",
    "latestRevision": {
      "id": "<UUID>",
      "projectId": "<project UUID>",
      "number": 1,
      "templateVersion": 1,
      "description": "A bracket for a small shelf",
      "parameters": {"height":40,"depth":40,"width":50,"thickness":4,"holeDiameter":5},
      "createdAt": "<UTC ISO timestamp>"
    }
  }
}
```

Rename with `PATCH /api/projects/:id` and `{"name":"New name"}`. Renaming updates
project metadata without creating or changing a geometry revision.

## Save revisions

```json
POST /api/projects/:id/revisions
{"parameters":{"width":70},"description":"Wider support","baseRevision":1}
```

parameters is required and follows the template validation rules. It is a new
parameter snapshot: omitted dimension fields reset to template defaults, rather
than merging with the previous revision. Send all current fields when editing an
existing snapshot. An omitted description inherits the latest description; an
empty string clears it. templateVersion is captured from the trusted catalogue.

baseRevision is an optional positive revision number. Supplying it rejects a stale
save with `409 REVISION_CONFLICT`. Omit it to append unconditionally. Saving a
revision and advancing the project's updatedAt happens in one SQLite transaction.
Numbers start at 1 and increase within each project. Revision records cannot be
edited or individually deleted. Fetch an old revision and append its parameters
as a new revision to restore it. Concurrent saves with the same baseRevision allow
one writer; the other receives a conflict without modifying history.

## Errors

```json
{
  "error": "Invalid template parameters",
  "code": "VALIDATION_ERROR",
  "details": [{"field":"parameters.width","message":"Must be a finite number between 10 and 200 mm"}]
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_QUERY` | Malformed JSON or list query |
| 404 | `NOT_FOUND` | Unknown endpoint, project, revision or template |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method |
| 409 | `REVISION_CONFLICT` | Stale baseRevision |
| 413 | `BODY_TOO_LARGE` | Payload exceeds 64 KiB, including chunked bodies |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | A write requires application/json |
| 422 | `VALIDATION_ERROR` | Invalid shape, fields, values or geometry |
| 500 | `INTERNAL_ERROR` | Unexpected failure; internal details stay in server logs |

## Storage and later integration

The default database is `data/soliddraft.sqlite`; `DB_PATH` selects another file.
Foreign keys, cascading deletion, unique revision numbers, transactions and WAL
protect saved data. Schema version 1 initializes automatically on first startup.
Close the service before copying the database for backup, or include SQLite's
WAL files/use a SQLite backup tool. Existing databases are never reseeded or reset
at startup, and a schema newer than this server supports prevents startup.

The API stores validated parameters and request descriptions. Local-model parsing,
CAD jobs, preview meshes, STL generation/downloads and account management are later
features and are not represented as completed render jobs here.
