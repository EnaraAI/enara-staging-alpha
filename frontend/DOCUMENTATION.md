# Enara: The Intelligence Layer for Education - Platform Documentation

## 1. Executive Summary
**Enara** is a next-generation, AI-first educational intelligence platform designed to bridge the gap between administrative oversight, teacher efficiency, and student success. By leveraging real-time telemetry, predictive cognitive modeling, and low-latency interactive AI tutors, Enara provides a "cognitive layer" that sits atop existing educational structures to drive superior learning outcomes.

---

## 2. Core Modules & Capabilities

### 2.1 Enara Admin (Super Admin) Dashboard
Designed for platform owners to manage the entire ecosystem of partner institutions.
- **Global KPI Monitoring**: Real-time tracking of total student enrollment, active institutions, and platform-wide retention rates.
- **Institution Performance Matrix**: A high-level health check for all partner schools, monitoring engagement, risk levels, and AI credit consumption.
- **AI Credit Intelligence**: A centralized system to oversee AI resource usage. Admins can top up, renew, or adjust AI credits for specific institutions.
- **Teacher Hours Saved (Aggregated)**: A flagship metric that quantifies the efficiency gains provided by Enara's AI across the entire network.
- **Institutions Directory & CRM**: A management interface for institution directors, providing quick access to contract status, billing history, and administrative contacts.

### 2.2 Research & Advanced Insights
The "brain" of the platform, providing deep-dive analytics for institution administrators, teachers, and researchers.
- **Strategic Performance Insights**: A dedicated module that categorizes the student population into:
    - **Excellence Clusters**: Identifying top performers (>90% mastery) and providing advanced cognitive decoupling strategies, heuristic inquiry, and peer synthesis roles.
    - **Intervention Queues**: Real-time identification of at-risk students with a "strategic recovery path" focusing on scaffolding recalibration, interaction priming, and batch refactoring.
- **Cognitive Profile Deep-Dive**: Analysis of "Guessing Suspicion," "Knowledge Retention," and "Intervention Effectiveness" scores to refine AI Tutor behaviors.
- **Student Intelligence Matrix**: A comprehensive database of student cognitive profiles, tracking "Time to Understand" (TTU), interaction depth, and mastery levels.
- **Exportable PDF Reports**: One-click **Export to PDF** capability on the Student Deep Analytics page, enabling educators to print or save comprehensive, publication-grade student progress reports for parents, academic review boards, and intervention tracking.
- **AI-Generated Improvement Plans**: Personalized, data-driven intervention plans for students, complete with priority levels, confidence scores, and expected impact metrics.
- **Cohort Intelligence Layer**: Advanced variance analysis that detects performance gaps between groups (e.g., identifying why Batch B is struggling with Algebra compared to Batch A).
- **AI-Generated Lesson Plans for Gaps**: A real-time remediation tool that analyzes identified knowledge gaps and generates a specific 3-day strategic intervention plan, including peer-to-peer synthesis and scaffolded drills.
- **Batch Matrix & Benchmarking**: Comparative tools to analyze performance across different cohorts, identifying high-velocity batches and those requiring intervention.
- **Granular Efficiency Tracking**: Breakdown of "Teacher Hours Saved" by subject, course, and batch.

### 2.3 Student Telemetry & Predictive Analytics
Real-time monitoring of student behavior and performance.
- **Predictive Risk Modeling**: AI models that identify students at risk of dropout or failure based on engagement patterns and performance trends.
- **Sentiment & Interaction Analysis**: Natural Language Processing (NLP) applied to AI Tutor interactions to gauge student confidence and emotional state.
- **Cognitive Mastery Radar**: Visual representation of a student's mastery across various topics, identifying specific strengths and weaknesses.

### 2.4 Assessment, Curriculum Center & Database Synchronization
- **Adaptive Assessment Interface**: Testing environments that adapt to student performance levels in real-time with built-in timers, subject filtering, and instant feedback.
- **AI-Powered Grading**: Automated feedback and scoring that drastically reduces teacher workload.
- **Curriculum Mapping & Automatic Tagging**: Chapter-based organization supporting multi-format resource uploads (PDFs, videos) and instant one-click shareable deployment links. When administrators create new courses, Enara automatically analyzes course content to generate smart taxonomy tags (e.g., `#Mathematics`, `#STEM`, `#SecondaryEducation`, `#AI-Indexed`, `#SocraticTutor`) and commits them directly to the Firestore `courses` database.
- **Real-Time Database Synchronization**: Live real-time updates for courses and student rosters powered by Firestore subscription channels.

### 2.5 Student Authentication, Credential Security & Teacher Experience
- **Administrator Credential Generation**: Institutional administrators generate official student login passwords when enrolling new students. Credentials (ID, email, password, and registered courses) are committed directly to the Firestore `students` database with instant copy-to-clipboard options.
- **Strict Credential Verification & Access Prohibition**: Student portal access is verified against live Firestore records (`verifyStudentLoginCredentials`). Access is strictly prohibited if incorrect credentials or uncommitted accounts are provided, presenting an explicit security error banner.
- **Personalized Student Dashboard**: A central hub for students to track their progress, view course materials, launch live tutoring sessions, and review test results.
- **Student-Controlled AI Tutor**: When opening course subjects, the AI Tutor remains minimized by default, giving students complete autonomy to expand or trigger assistance when needed without intrusive overlays.
- **Live AI Tutor Studio (WebRTC Engine)**: Interactive video tutoring powered by Enara's native WebRTC real-time avatar engine and Gemini multi-modal AI, offering Socratic inquiry and natural spoken responses.
- **Teacher Analytics**: Tools for educators to monitor their specific courses, identify struggling students, and access AI-assisted teaching resources.

---

## 3. Key Metrics Defined

| Metric | Definition |
| :--- | :--- |
| **Teacher Hours Saved** | The estimated time saved by educators through AI-powered grading, automated feedback, and administrative automation. |
| **TTU (Time to Understand)** | The average time a student spends interacting with a specific concept before achieving mastery. |
| **Interaction Depth** | A measure of the complexity and quality of a student's dialogue with the AI Tutor. |
| **LEI (Learning Efficiency Index)** | A ratio of mastery achievement relative to time and effort expended. |
| **Risk Index** | A predictive score (Low/Medium/High) indicating the likelihood of a student requiring intervention. |
| **Struggle Time** | Measures the cognitive load by tracking time spent on difficult concepts vs. successful resolution. |
| **Sentiment Score** | Real-time emotional tracking (NLP) of student interactions to detect frustration or confidence. |
| **AI Credits** | The currency used by institutions to power AI-driven features like tutoring and predictive analytics. |

---

## 4. Platform Deployment & Infrastructure
- **Full-Stack Architecture**: Unified Express + Vite server with server-side proxy routes for secret API keys (Gemini, WebRTC avatar keys).
- **Railway & Cloud Run Deployment**: Configured with dynamic `PORT` environment variable binding (`process.env.PORT || 3000`) and single-file CommonJS backend compilation (`dist/server.cjs`) for zero-configuration, seamless deployment on Railway, Google Cloud Run, and Docker environments.
- **Security & Governance**: Role-based access control (RBAC) across Enara Admins, Institution Admins, Teachers, and Students with masked server-side API keys.

---

## 5. Vision & Future Roadmap
Enara aims to move beyond simple analytics into **Active Intervention**, where the AI not only identifies problems but autonomously initiates corrective learning paths, further reducing the burden on human educators while ensuring no student is left behind.

---

## 6. AI Tutor Vector Embedding & AWS Integration API

Enara provides an AWS-compatible LLM & Embedding Integration Gateway, enabling external enterprise systems, Amazon Bedrock Agents, SageMaker endpoints, and custom LLM workflows to query the Socratic Tutor knowledge base and generate dense vector embeddings.

### 6.1 AWS Bedrock Compatible Embedding API
- **Endpoints**: `POST /api/aws/bedrock/embed` | `POST /api/tutor/embeddings` | `POST /api/v1/embeddings`
- **Compatibility**: Supports Amazon Titan Text Embeddings v2 (`amazon.titan-embed-text-v2:0`) and Google Gemini `text-embedding-004`.
- **Vector Output**: 768-dimensional normalized dense float vectors with token count usage metadata.
- **Sample Request Payload**:
```json
{
  "inputText": "Explain momentum conservation and kinetic energy in classical mechanics.",
  "modelId": "amazon.titan-embed-text-v2:0",
  "dimensions": 768
}
```
- **Sample Response Payload**:
```json
{
  "embedding": [0.0142, -0.0381, 0.0915, "... 768 dimensions"],
  "inputTextTokenCount": 11,
  "dimensions": 768,
  "modelId": "amazon.titan-embed-text-v2:0",
  "awsRequestId": "amzn-bedrock-1753689230123-x82a",
  "provider": "Enara-AWS-LLM-Tutor-Bridge"
}
```

### 6.2 AWS Bedrock Runtime InvokeModel Gateway
- **Endpoints**: `POST /api/aws/bedrock/invoke-model` | `POST /api/aws/sagemaker/invocations`
- **Capabilities**: Invokes the Enara Tutor LLM runtime engine, returning assistant responses alongside attached document vector embeddings for downstream AWS Bedrock agents and LangChain workflows.
- **Header Compatibility**: Supports `X-Amz-Target: AmazonBedrockRuntime.InvokeModel` and returns `x-amzn-RequestId` headers.

### 6.3 Vector RAG Knowledge Search API
- **Endpoint**: `POST /api/tutor/rag/search`
- **Capabilities**: Executes semantic vector similarity searches across curriculum content, returning top-K matches with cosine similarity scores and course document references.

### 6.4 AWS OpenAPI Specification
- **Specification Endpoint**: `GET /api/aws/openapi.json`
- **Compatibility**: Standard OpenAPI 3.0.3 specification for seamless integration with Python `boto3`, Node.js `@aws-sdk/client-bedrock-runtime`, and `langchain-aws`.

---

## 7. Railway Central Backend Migration & Microservices Architecture

Enara integrates directly with a production microservices backend engine hosted on Railway (`https://backend-engine-copy-production.up.railway.app`), providing dedicated REST endpoints for key platform services:

### 7.1 Authentication Service (`/api/auth/login`)
- **Endpoint**: `POST /api/auth/login`
- **Description**: Authenticates users (Students, Teachers, Institution Admins, Enara Admins) and issues secure JWT tokens.
- **Payload**: `{ "email": "user@enara.edu", "password": "...", "role": "student" }`
- **Token Handling**: Persisted client-side in `localStorage` under `enara_railway_token` and passed as `Authorization: Bearer <token>` on all downstream requests.

### 7.2 Student Management Service (`/api/students`)
- **Endpoints**: `GET /api/students` | `POST /api/students` | `DELETE /api/students/:id`
- **Description**: Replaces client-side database reads with centralized REST endpoints for fetching student rosters, enrolling new students, generating institutional credentials, and managing student profiles.

### 7.3 Curriculum & Course Service (`/api/curriculums`)
- **Endpoints**: `GET /api/curriculums` | `POST /api/curriculums` | `DELETE /api/curriculums/:id`
- **Description**: Centralized curriculum management service for storing, deploying, and deleting educational frameworks, chapters, and assigned student batches.

### 7.4 Course Asset & File Upload Service (`/api/upload/course/{courseId}`)
- **Endpoint**: `POST /api/upload/course/:courseId`
- **Description**: Handles file uploads (PDFs, course syllabus documents, slides) associated with specific curriculum courses.

### 7.5 AI Tutor Sessions Service (`/api/me/tutor/sessions`)
- **Endpoints**: `GET /api/me/tutor/sessions` | `POST /api/me/tutor/sessions`
- **Description**: Manages AI Socratic tutoring sessions, history persistence, and context-aware prompt execution via Railway's AI Tutor engine.

### 7.6 AI Credits & Usage Ledger Service (`/api/me/credits`)
- **Endpoints**: `GET /api/me/credits` | `POST /api/me/credits`
- **Description**: Real-time credit balance querying and usage deduction tracking for institutional AI credit wallets.


