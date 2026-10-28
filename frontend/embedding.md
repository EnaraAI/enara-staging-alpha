# Curriculum Vector Embedding Integration Guide

Welcome to the **Enara Curriculum Vector Embedding Integration Guide**. This document provides full specifications, code examples, and workflow architectures for integrating external curriculum data streams, AWS S3 buckets, and AWS Bedrock Knowledge Bases into Enara's AI vector indexing engine.

---

## 1. Architecture Overview

Enara accepts curriculum text chunks, processes them into high-dimensional (768-d) vector embeddings, and indexes them in real-time. This enables:
- **Socratic AI Tutor Retrieval**: Instant retrieval of relevant textbook passages during student query sessions.
- **Cross-Curricular Search**: Semantic matching across national and international educational frameworks.
- **Automated AI Taxonomy**: Smart tagging and categorization based on vector density.

```
[ External Curriculum / AWS S3 / Bedrock ]
                  │
                  ▼  (HTTPS POST Payload)
   [ Enara Vector Ingestion API ]
                  │
                  ▼
   [ 768-d Vector Embedding Pipeline ]
                  │
                  ▼
   [ Firestore & Vector Index Storage ]
```

---

## 2. API Endpoint Reference

### Primary Ingestion Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/curriculum/embed` | `POST` | Primary REST endpoint for array of curriculum text chunks |
| `/api/v1/curriculum/ingest` | `POST` | Pipeline endpoint for AWS S3 and automated workflow triggers |
| `/api/aws/bedrock/embed` | `POST` | AWS Bedrock Titan v2 compatible vector bridge |

---

## 3. Authentication & Headers

All requests to the embedding endpoints require an Authorization header:

```http
Authorization: Bearer <YOUR_PARTNER_API_KEY>
Content-Type: application/json
X-AWS-Source-Bucket: s3://your-curriculum-bucket-name
```

> **Default Partner Key for Development:** `enara_live_partner_key_2026`

---

## 4. Request & Response Payload Specs

### Request Body Schema (JSON)

```json
{
  "courseId": "CRS-PHYS-101",
  "courseTitle": "AP Physics: Classical Mechanics",
  "chapterTitle": "Chapter 4: Conservation of Momentum and Energy",
  "awsSourceBucket": "s3://enara-curriculum-raw-vectors-us-east-1/physics_grade11.json",
  "knowledgeBaseId": "kb-aws-titan-768d",
  "institutionId": "INST-GLOBAL-TECH",
  "contentChunks": [
    "In an isolated system, the total linear momentum before collision equals the total linear momentum after.",
    "Newton's Second Law: Force F = dp/dt = ma describes vector momentum change over time.",
    "Work-Energy Principle: Net work done on an object equals its change in kinetic energy."
  ]
}
```

### Response Schema (JSON)

```json
{
  "success": true,
  "awsIngestionJobId": "aws-ingest-job-1712345678-x9y8z7",
  "status": "COMPLETED",
  "courseId": "CRS-PHYS-101",
  "courseTitle": "AP Physics: Classical Mechanics",
  "chapterTitle": "Chapter 4: Conservation of Momentum and Energy",
  "awsSourceBucket": "s3://enara-curriculum-raw-vectors-us-east-1/physics_grade11.json",
  "vectorProvider": "AWS Titan v2 / Gemini Hybrid Embeddings",
  "dimensions": 768,
  "indexedChunksCount": 3,
  "chunks": [
    {
      "chunkIndex": 0,
      "chunkId": "chunk-CRS-PHYS-101-1",
      "vectorSnippet": [-0.0245, 0.0812, 0.1104, -0.0531, 0.0098, 0.0412],
      "tokenCount": 18,
      "similarityDensity": 0.985
    }
  ],
  "metadata": {
    "timestamp": "2026-07-28T12:15:00.000Z",
    "institutionId": "INST-GLOBAL-TECH",
    "awsBedrockKnowledgeBaseId": "kb-aws-titan-768d",
    "syncStatus": "COMMITTED_TO_FIRESTORE_AND_VECTOR_DB"
  }
}
```

---

## 5. Integration Code Examples

### A. Quick Start with cURL

```bash
curl -X POST "https://app.enara.edu/api/v1/curriculum/embed" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer enara_live_partner_key_2026" \
  -H "X-AWS-Source-Bucket: s3://enara-curriculum-raw-vectors-us-east-1" \
  -d '{
    "courseId": "CRS-PHYS-101",
    "courseTitle": "AP Physics: Classical Mechanics",
    "chapterTitle": "Chapter 4: Conservation of Momentum",
    "contentChunks": [
      "In an isolated system, total linear momentum remains constant before and after collisions.",
      "Newton Second Law: Net force equals time rate of change of momentum (F = dp/dt)."
    ]
  }'
```

---

### B. AWS Lambda Trigger (Python 3.11)

Use this Lambda handler to automatically stream new curriculum JSON uploads from AWS S3 directly into Enara's vector index:

```python
import json
import urllib.request
import boto3

def lambda_handler(event, context):
    # 1. Parse AWS S3 Event Trigger
    s3 = boto3.client('s3')
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    # 2. Download Curriculum Document from S3
    obj = s3.get_object(Bucket=bucket, Key=key)
    curriculum_json = json.loads(obj['Body'].read().decode('utf-8'))
    
    # 3. Structure Ingestion Payload
    payload = {
        "courseId": curriculum_json.get("course_id", "CRS-AWS-INGEST-101"),
        "courseTitle": curriculum_json.get("title", "AWS Ingested Course"),
        "chapterTitle": curriculum_json.get("chapter", "Chapter 1"),
        "awsSourceBucket": f"s3://{bucket}/{key}",
        "contentChunks": curriculum_json.get("chunks", [])
    }
    
    # 4. POST to Enara Curriculum Embedding Endpoint
    req = urllib.request.Request(
        "https://app.enara.edu/api/v1/curriculum/embed",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer enara_live_partner_key_2026"
        },
        method="POST"
    )
    
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"AWS Ingestion Job {result['awsIngestionJobId']} status: {result['status']}")
        return result
```

---

### C. Node.js AWS SDK (TypeScript)

```typescript
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "us-east-1" });

export async function ingestCurriculumFromAWS(bucketName: string, objectKey: string) {
  const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
  const s3Response = await s3.send(getCmd);
  const fileContent = await s3Response.Body?.transformToString();
  const curriculumData = JSON.parse(fileContent || "{}");

  const response = await fetch("https://app.enara.edu/api/v1/curriculum/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer enara_live_partner_key_2026",
      "X-AWS-Source-Bucket": `s3://${bucketName}/${objectKey}`
    },
    body: JSON.stringify({
      courseId: curriculumData.courseId || "CRS-AWS-NODE-01",
      courseTitle: curriculumData.courseTitle || "AWS Node Ingested Course",
      chapterTitle: curriculumData.chapterTitle || "Chapter 1",
      awsSourceBucket: `s3://${bucketName}/${objectKey}`,
      contentChunks: curriculumData.contentChunks || []
    })
  });

  const jsonResult = await response.json();
  console.log(`Successfully ingested ${jsonResult.indexedChunksCount} vectors (768d Titan v2 format).`);
  return jsonResult;
}
```

---

## 6. Testing in UI

You can test curriculum embedding live within the Enara application:
1. Navigate to **Integrations** in the top navigation bar.
2. Click the **API Integration** tab.
3. Edit the JSON payload or select a target endpoint.
4. Click **Execute Ingestion API Request** to view live 768d vector outputs and latency.

---

## 7. Railway Central Backend Integration & Curriculum Services

Enara integrates curriculum management and vector tutoring with the Railway production backend engine (`https://backend-engine-copy-production.up.railway.app`):

| Service | Railway Endpoint | Description |
| :--- | :--- | :--- |
| **Auth** | `POST /api/auth/login` | Authenticates partners & issues JWT bearer tokens |
| **Curriculums** | `GET /api/curriculums` | Synchronizes vector-indexed courses with central backend |
| **Course File Uploads** | `POST /api/upload/course/{courseId}` | Ingests PDF/doc curriculum files for vector chunking |
| **Tutor Sessions** | `POST /api/me/tutor/sessions` | Sends RAG tutor prompts & retrieves embedding-backed answers |
| **Credits Ledger** | `GET /api/me/credits` | Tracks vector embedding & tutor query token usage |

