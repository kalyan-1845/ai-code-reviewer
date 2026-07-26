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
  - [POST /chat](#post-chat)
  - [POST /review-diff](#post-review-diff)
  - [POST /api/rag/split](#post-apiragsplit)
  - [POST /api/rag/query](#post-apiragquery)
  - [POST /api/rag/cleanup](#post-apiragcleanup)
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

### POST /chat

Converses with the AI engine about the provided codebase. Injects repository structure and file contents into the system prompt. Optionally retrieves semantically relevant chunks via RAG.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field      | Type             | Required | Description                                                               |
| ---------- | ---------------- | -------- | ------------------------------------------------------------------------ |
| `files`    | array\<FileItem> | Yes      | List of files with `{ name: string, content: string }`.                  |
| `message`  | string           | Yes      | User message/question.                                                   |
| `history`  | array\<object>  | No       | Prior chat messages as `[{ role: "user"|"assistant", content: string }]`. |
| `model`    | string           | No       | Groq model name (default: `llama-3.3-70b-versatile`).                  |
| `useRag`   | boolean          | No       | Whether to retrieve RAG chunks before answering (default: `false`).     |

**FileItem object**

| Field    | Type   | Description                    |
| -------- | ------ | ------------------------------ |
| `name`   | string | Relative file path.            |
| `content`| string | Full file contents.            |

**Example request body**

```json
{
  "files": [
    { "name": "src/utils/helper.py", "content": "def add(a, b):\n    return a + b" }
  ],
  "message": "What does this file do?",
  "history": [],
  "model": "llama-3.3-70b-versatile",
  "useRag": false
}
```

#### Response

**Status `200 OK`**

| Field       | Type   | Description                          |
| ----------- | ------ | ------------------------------------ |
| `response`  | string | AI assistant reply (HTML sanitized). |

**Example response body**

```json
{
  "response": "This file defines a simple `add` function that returns the sum of two arguments."
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "helper.py", "content": "def add(a, b):\n    return a + b"}],
    "message": "What does this file do?",
    "useRag": false
  }'
```

---

### POST /review-diff

Reviews code additions in a pull request diff using the Groq LLM. Returns structured inline review comments with file path, line number, and recommendation.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field   | Type                   | Required | Description                            |
| ------- | ---------------------- | -------- | -------------------------------------- |
| `files` | array\<FileChanges>  | Yes      | List of changed files with line diffs. |
| `model` | string                | No       | Groq model name (default: `llama-3.3-70b-versatile`). |

**FileChanges object**

| Field     | Type                    | Description                                      |
| --------- | ----------------------- | ------------------------------------------------ |
| `path`    | string                 | Relative file path.                              |
| `changes` | array\<DiffChange>    | Line additions in this file.                     |

**DiffChange object**

| Field     | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `line`    | number | Line number in the new file. |
| `content` | string | New line content.             |

**Example request body**

```json
{
  "files": [
    {
      "path": "src/utils/helper.py",
      "changes": [
        { "line": 5, "content": "const SECRET = 'abc123'" },
        { "line": 10, "content": "return process(input)" }
      ]
    }
  ],
  "model": "llama-3.3-70b-versatile"
}
```

#### Response

**Status `200 OK`**

| Field      | Type                        | Description                    |
| ---------- | --------------------------- | ------------------------------ |
| `comments` | array\<ReviewComment>      | List of inline review comments. |

**ReviewComment object**

| Field  | Type   | Description                                         |
| ------ | ------ | --------------------------------------------------- |
| `path` | string | File path the comment refers to.                    |
| `line` | number | Line number.                                        |
| `body` | string | Markdown-formatted review text (HTML-sanitized).    |

**Example response body**

```json
{
  "comments": [
    {
      "path": "src/utils/helper.py",
      "line": 5,
      "body": "<!-- RepoSage Review Comment -->\n### Security Issue\n\nHardcoded credential detected.\n\n#### Recommendation\n\n```javascript\n// use environment variable\nconst SECRET = process.env.API_SECRET;\n```"
    }
  ]
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/review-diff \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"path": "helper.py", "changes": [{"line": 5, "content": "const SECRET = "abc123""}]}],
    "model": "llama-3.3-70b-versatile"
  }'
```

---

### POST /api/rag/split

Splits source files into text chunks suitable for RAG (Retrieval-Augmented Generation) ingestion. Internally uses langchain RecursiveCharacterTextSplitter with language-specific separators.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field          | Type                  | Required | Description                                           |
| -------------- | --------------------- | -------- | ----------------------------------------------------- |
| `files`        | array\<FileItem>     | Yes      | Files to split (same FileItem shape as /chat).       |
| `chunk_size`   | number               | No       | Max characters per chunk (default: `1000`).          |
| `chunk_overlap`| number               | No       | Overlap between chunks (default: `200`).             |
| `repo_url`     | string               | No       | Repository URL stored in chunk metadata.               |

**Example request body**

```json
{
  "files": [
    { "name": "src/app.py", "content": "..." }
  ],
  "chunk_size": 1000,
  "chunk_overlap": 200,
  "repo_url": "https://github.com/user/repo"
}
```

#### Response

**Status `200 OK`**

| Field          | Type             | Description                          |
| -------------- | ---------------- | ------------------------------------ |
| `chunks`       | array\<Chunk>  | List of text chunks with metadata.   |
| `total_chunks` | number          | Total number of chunks produced.     |
| `total_files`  | number          | Number of input files processed.     |

**Chunk object**

| Field      | Type   | Description                                                    |
| ---------- | ------ | -------------------------------------------------------------- |
| `chunk_id` | string | SHA256-based 16-character hex identifier.                      |
| `content`  | string | Chunk text content.                                            |
| `metadata` | object | Source file, language, line range, chunk index, repo URL.       |

**Example response body**

```json
{
  "chunks": [
    {
      "chunk_id": "a1b2c3d4e5f60718",
      "content": "def add(a, b):\n    return a + b",
      "metadata": {
        "source_file": "src/app.py",
        "fileName": "src/app.py",
        "language": "python",
        "chunk_index": 0,
        "total_chunks": 1,
        "start_line": 0,
        "end_line": 1,
        "repoUrl": "https://github.com/user/repo"
      }
    }
  ],
  "total_chunks": 1,
  "total_files": 1
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/api/rag/split \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "src/app.py", "content": "def add(a, b):\n    return a + b"}],
    "chunk_size": 1000,
    "chunk_overlap": 200
  }'
```

---

### POST /api/rag/query

Queries the RAG (ChromaDB) vector store for semantically relevant code chunks given a natural-language question. Chunks are ranked by cosine similarity.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field      | Type   | Required | Description                        |
| ---------- | ------ | -------- | ---------------------------------- |
| `question` | string | Yes      | Natural-language query.            |

**Example request body**

```json
{
  "question": "How is authentication handled in this codebase?"
}
```

#### Response

**Status `200 OK`**

| Field          | Type               | Description                        |
| -------------- | ------------------ | ---------------------------------- |
| `chunks`       | array\<RagChunk> | Ranked list of relevant chunks.    |
| `total_chunks` | number            | Number of chunks returned.         |

**RagChunk object**

| Field              | Type   | Description                                          |
| ------------------ | ------ | ---------------------------------------------------- |
| `chunk_id`         | string | Unique chunk identifier.                             |
| `content`          | string | Chunk text content.                                  |
| `metadata`         | object | Source file, language, line range, repo URL.         |
| `similarity_score` | number | Cosine similarity score (1 = perfect match).        |

**Example response body**

```json
{
  "chunks": [
    {
      "chunk_id": "a1b2c3d4e5f60718",
      "content": "def authenticate(token):\n    ...",
      "metadata": {
        "source_file": "src/auth.py",
        "fileName": "src/auth.py",
        "language": "python"
      },
      "similarity_score": 0.92
    }
  ],
  "total_chunks": 1
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How is authentication handled in this codebase?"}'
```

---

### POST /api/rag/cleanup

Removes stale vector embeddings from ChromaDB for files that no longer exist in the repository. This is called during repository re-analysis to prevent old code from polluting new review results.

#### Request

**Headers**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | Yes      |

**Body**

| Field         | Type     | Required | Description                                              |
| ------------ | -------- | -------- | -------------------------------------------------------- |
| `current_files` | array\<string> | Yes | List of file paths currently present in the repository. |
| `repo_url`   | string   | No       | Repository URL used to scope cleanup to a specific repo. |

**Example request body**

```json
{
  "current_files": ["src/app.py", "src/utils.py", "README.md"],
  "repo_url": "https://github.com/user/my-repo"
}
```

#### Response

**Status `200 OK`**

| Field          | Type   | Description                                   |
| -------------- | ------ | --------------------------------------------- |
| `deleted_count` | number | Number of stale chunks removed from ChromaDB. |

**Example response body**

```json
{
  "deleted_count": 7
}
```

#### curl Example

```bash
curl -X POST http://localhost:8000/api/rag/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "current_files": ["src/app.py", "src/utils.py"],
    "repo_url": "https://github.com/user/my-repo"
  }'
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