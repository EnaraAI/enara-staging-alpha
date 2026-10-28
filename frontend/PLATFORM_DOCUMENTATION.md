# Enara: The Intelligence Layer for Education - Platform Documentation

## 1. Platform Overview
Enara is a comprehensive, AI-driven educational intelligence platform designed to bridge the gap between teaching and learning. By leveraging real-time cognitive mapping and predictive analytics, Enara provides educators and administrators with actionable insights to improve student outcomes and institutional efficiency.

---

## 2. User Roles & Access

### **Student**
Focuses on personalized learning, course engagement, and assessment performance.
- **Course Access**: Interactive learning modules and curriculum tracking with clean sidebar navigation.
- **Strict Credential Verification**: Student access is authenticated directly against committed Firestore database records (`verifyStudentLoginCredentials`). Access is strictly prohibited if incorrect credentials or uncommitted emails/passwords are entered.
- **Student-Centered AI Tutor**: AI Tutor remains minimized when entering courses, allowing students to focus on content and trigger live help on demand.
- **Assessments**: Real-time testing interface with immediate feedback, timer controls, and subject filtering.
- **Live Avatar Tutor Studio**: Powered by Enara's native WebRTC real-time avatar engine for low-latency video and audio tutoring.

### **Admin (Institutional Director/Teacher)**
Manages the academic health of the institution and individual courses.
- **Dashboard**: High-level KPIs, critical risk alerts, and credit utilization.
- **Course Intelligence**: Deep-dive analytics into specific subjects, knowledge gaps, and pre-exam preparation behavior.
- **Student Management & Credential Generation**: Register students into the Firestore database, generate secure password credentials, assign course enrollments, and copy or view student credentials anytime.
- **Deep Analytics**: Roster control, individual progress tracking, cognitive profiles, and **one-click Export to PDF** for publication-ready reports.

### **Enara Admin (Platform Executive)**
Oversees the entire ecosystem, multiple institutions, and platform health.
- **Institutional CRM**: Management of partner schools, subscriptions, and contract status.
- **Financials**: Revenue tracking, ROI metrics, and audit compliance.
- **Control Center**: Server-side WebRTC Avatar and API configuration, global credit management, and real-time streaming telemetry.

---

## 3. Core Features & Capabilities

### **A. Course Intelligence (AI-Powered Analytics)**
The heart of Enara's data engine, providing deep insights into classroom dynamics.
- **Institutional View**: Aggregate data on engagement quality, resolution rates, and session durations.
- **Predictive Success Rate**: AI-forecasted pass rate trends that predict student outcomes weeks before exams.
- **Topic Mastery Radar**: Visual mapping of student strengths and weaknesses across different curriculum areas.
- **Knowledge Gaps**: Identification of "Most Asked Questions" and automated lesson plan generation to address specific confusion points.
- **Pre-Exam Behavior**: Analysis of study spikes and volume to detect last-minute cramming or preparation readiness.
- **Course Comparison**: Side-by-side benchmarking of multiple courses to identify high-performing teaching strategies or curriculum bottlenecks.

### **B. Student Performance Matrix & Deep Insights**
Granular tracking of individual student journeys.
- **Cognitive Profile**: Real-time mapping of mastery levels and correlation between study habits and scores.
- **Behavioral Patterns**: Tracking "Struggle Duration," "Engagement Depth," and "Resolution Speed."
- **Exportable PDF Reports**: Direct "Export to PDF" button on student profile cards generating formatted progress summaries for parents and staff.
- **AI Recommendations**: Personalized, automated suggestions for students (e.g., "Recommend visual aids for Abstract Reasoning").
- **Personalized Study Plans**: One-click generation of tailored preparation materials based on individual cognitive gaps.

### **C. Admin Dashboard & Management**
Tools for efficient institutional oversight.
- **KPI Tracking**: Real-time monitoring of Total Students, Avg Progress, Study Time, and Avg Score.
- **Critical Alerts**: AI-triggered notifications for "At Risk" students based on participation drops or performance dips.
- **Student Roster**: Centralized management for enrolling students and viewing detailed profiles.
- **Quick Actions**: Rapid access to creating assessments, managing AI credits, and generating institutional reports.

### **D. Curriculum & Batch Management**
Streamlining the organization and deployment of educational content.
- **Curriculum Repository & Automatic Tagging**: A centralized hub for managing national and international frameworks. When administrators create new courses, Enara automatically analyzes title, level, and description metadata to generate taxonomy tags (e.g., `#Mathematics`, `#STEM`, `#SecondaryEducation`, `#AI-Indexed`, `#SocraticTutor`) and commits them directly to the Firestore `courses` collection.
- **Real-Time Database Synchronization**: Live real-time updates for courses across institutions using Firestore snapshot listeners.
- **Chapter-Based Organization**: Content is structured into chapters with support for multiple file uploads (PDFs, Videos, etc.).
- **Deployment & Sharing**: One-click "Deploy" feature that generates unique, shareable access links for students.
- **Batch Assignment**: Efficiently organize students into cohorts (Batches) and assign specific curriculums to them.
- **Real-Time Tracking**: Monitor which batches are assigned to which frameworks and track their overall progress.

### **E. Assessment Center**
Comprehensive tools for designing and administering evaluations.
- **AI-Supported Test Design**: Design assessments with automated difficulty balancing and topic alignment.
- **Real-Time Monitoring**: Track student completion rates and scores as they happen.
- **Assessment Interface**: A modern, distraction-free environment for students to complete tests with built-in timers and progress indicators.
- **Immediate Results**: Automated grading and instant feedback for students upon completion.

### **F. Live AI Tutor Studio (WebRTC)**
- **Student-Activated**: Accessible on demand from the dashboard or course view.
- **Interactive Avatar Models**: Socratic academic personas (Athena, Marcus, Sofia) providing real-time spoken guidance.
- **Low-Latency Streaming**: Built on Enara's real-time WebRTC audio/video synthesis layer.

### **G. Enara Executive Suite (Enara Admin)**
High-level business and operational intelligence.
- **Revenue Growth**: Tracking institutional subscriptions and financial performance.
- **Contract Management**: Oversight of institutional partnerships and service level agreements.
- **ROI Metrics**: Demonstrating the platform's value through improved student success and operational savings.

---

## 4. Technical Architecture & Hosting
- **Unified Express Backend**: Server-side API proxy handling Gemini and WebRTC avatar credentials securely.
- **Railway & Multi-Cloud Compatibility**: Configured with dynamic `PORT` environment handling (`process.env.PORT || 3000`) and compiled `dist/server.cjs` bundle for seamless deployment on Railway, Google Cloud Run, and Docker.
- **Responsive Interface**: Fully optimized for Desktop, Tablet, and Mobile experiences.
- **Interactive Visualizations**: Powered by Recharts for clear, actionable data storytelling.
- **Fluid Animations**: Enhanced user experience via Framer Motion for intuitive transitions and feedback.

---

## 5. AI Tutor Embedding & AWS LLM Integration Specifications

Enara provides enterprise-grade, AWS-compatible LLM & Embedding integration endpoints for external AI workflows, Amazon Bedrock, and SageMaker environments.

### 5.1 Tutor Vector Embedding Gateway
- **POST `/api/aws/bedrock/embed`**: Amazon Titan Embeddings v2 compatible endpoint returning 768-dimensional normalized dense vectors.
- **POST `/api/tutor/embeddings`**: Standard REST API endpoint for vectorizing course content and student prompts.

### 5.2 AWS Bedrock Runtime & SageMaker Invocations
- **POST `/api/aws/bedrock/invoke-model`**: Invokes the Tutor reasoning engine, outputting assistant content with vector embeddings.
- **POST `/api/aws/sagemaker/invocations`**: SageMaker endpoint alias with `x-amzn-RequestId` headers.

### 5.3 Vector RAG Knowledge Base Search
- **POST `/api/tutor/rag/search`**: Vector similarity search across course materials with cosine distance metrics.

### 5.4 OpenAPI Definition
- **GET `/api/aws/openapi.json`**: Live OpenAPI 3.0.3 schema for automated client generation with Python Boto3 and AWS SDKs.


