# API Reference

This document describes the HTTP endpoints exposed by the two services in this project:

- **Backend** — Express.js server (default port `5000`)
- **AI Engine** — FastAPI server (default port `8000`)

---

## Table of Contents

- [Backend Endpoints](#backend-endpoints)
  - [POST /api/analyze](#post-apianalyze)
- [AI Engine Endpoints](#ai-engine-endpoints)
  - [POST /analyze](#post-analyze)
- [Error Responses](#error-responses)

---

## Backend Endpoints

Base URL: `http://localhost:5000`

---

### POST /api/analyze

Accepts a repository URL plus configuration options, forwards the request to the AI engine, and returns structured findings for each file in the repository.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field      | Type   | Required | Description                                                                 |
| ---------- | ------ | -------- | --------------------------------------------------------------------------- |
| `repoUrl`  | string | Yes      | Full HTTPS URL of the Git repository to analyze (e.g. a GitHub repo URL).  |
| `model`    | string | Yes      | AI model identifier to use for analysis (e.g. `"gpt-4o"`, `"gemini-pro"`). |
| `language` | string | No       | Primary programming language hint (e.g. `"python"`, `"javascript"`).       |

**Example request body**

```json
{
  "repoUrl": "https://github.com/example-user/example-repo",
  "model": "gpt-4o",
  "language": "python"
}
```

#### Response

**Status `200 OK`**

| Field         | Type            | Description                                                     |
| ------------- | --------------- | --------------------------------------------------------------- |
| `bugs`        | array\<Finding> | List of bug-related findings across the repository.             |
| `security`    | array\<Finding> | List of security vulnerability findings.                        |
| `optimization`| array\<Finding> | List of performance and code-quality improvement suggestions.   |
| `files`       | array\<File>    | Metadata for every file that was analyzed.                      |

**Finding object**

| Field       | Type   | Description                                          |
| ----------- | ------ | ---------------------------------------------------- |
| `file`      | string | Relative path of the file containing the finding.   |
| `line`      | number | Line number where the issue was detected.            |
| `severity`  | string | `"low"`, `"medium"`, or `"high"`.                   |
| `message`   | string | Human-readable description of the finding.          |
| `suggestion`| string | Recommended fix or improvement.                     |

**File object**

| Field    | Type   | Description                           |
| -------- | ------ | ------------------------------------- |
| `path`   | string | Relative path of the file.            |
| `status` | string | `"analyzed"`, `"skipped"`, or `"error"`. |

**Example response body**

```json
{
  "bugs": [
    {
      "file": "src/utils/parser.py",
      "line": 42,
      "severity": "high",
      "message": "Potential None dereference: variable 'result' may be None before use.",
      "suggestion": "Add a None check or use an early return before accessing result.data."
    }
  ],
  "security": [
    {
      "file": "src/api/routes.py",
      "line": 17,
      "severity": "high",
      "message": "SQL query built using string concatenation; vulnerable to SQL injection.",
      "suggestion": "Use parameterized queries or an ORM instead of string formatting."
    }
  ],
  "optimization": [
    {
      "file": "src/utils/parser.py",
      "line": 89,
      "severity": "low",
      "message": "Repeated list comprehension inside a loop causes O(n²) complexity.",
      "suggestion": "Pre-compute the list outside the loop or use a set for O(1) lookups."
    }
  ],
  "files": [
    { "path": "src/utils/parser.py", "status": "analyzed" },
    { "path": "src/api/routes.py",   "status": "analyzed" },
    { "path": "README.md",           "status": "skipped"  }
  ]
}
```

#### curl Example

```bash
curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/example-user/example-repo",
    "model": "gpt-4o",
    "language": "python"
  }'
```

---

## AI Engine Endpoints

Base URL: `http://localhost:8000`

The AI Engine is a FastAPI service that performs the actual code analysis. It is called internally by the Backend but can also be used directly.

---

### POST /analyze

Analyzes source code content and returns categorized findings.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field      | Type             | Required | Description                                                                    |
| ---------- | ---------------- | -------- | ------------------------------------------------------------------------------ |
| `repoUrl`  | string           | Yes      | Full HTTPS URL of the repository to clone and analyze.                         |
| `model`    | string           | Yes      | AI model identifier passed through to the underlying LLM client.              |
| `language` | string           | No       | Language hint used to filter files and tune prompts.                           |
| `files`    | array\<string>   | No       | Explicit list of relative file paths to analyze; analyzes all files if omitted.|

**Example request body**

```json
{
  "repoUrl": "https://github.com/example-user/example-repo",
  "model": "gpt-4o",
  "language": "python",
  "files": ["src/utils/parser.py", "src/api/routes.py"]
}
```

#### Response

**Status `200 OK`**

Returns the same shape as the Backend `/api/analyze` response (see [above](#post-apianalyze)).

```json
{
  "bugs": [ ... ],
  "security": [ ... ],
  "optimization": [ ... ],
  "files": [ ... ]
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/example-user/example-repo",
    "model": "gpt-4o",
    "language": "python",
    "files": ["src/utils/parser.py", "src/api/routes.py"]
  }'
```

#### FastAPI Interactive Docs

When the AI Engine is running locally you can explore and test all endpoints through the auto-generated Swagger UI:

```
http://localhost:8000/docs
```

---

## Error Responses

Both services return standard HTTP error codes with a JSON body.

| Status | Meaning               | Example body                                      |
| ------ | --------------------- | ------------------------------------------------- |
| `400`  | Bad Request           | `{ "error": "repoUrl is required" }`              |
| `422`  | Unprocessable Entity  | `{ "detail": [{ "msg": "field required", ... }] }`|
| `500`  | Internal Server Error | `{ "error": "Failed to clone repository" }`       |

> **Note:** `422` responses are generated automatically by FastAPI when request validation fails and follow the standard Pydantic error schema.