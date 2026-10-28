import { OpenAPIV3 } from 'openapi-types';

const bearerAuth: OpenAPIV3.SecuritySchemeObject = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT from POST /api/auth/login',
};

const ingestionHmac: OpenAPIV3.SecuritySchemeObject = {
  type: 'apiKey',
  in: 'header',
  name: 'X-Enara-Signature',
  description: 'Canonical HMAC signature for service-to-service ingestion requests',
};

const ingestionTimestamp: OpenAPIV3.SecuritySchemeObject = {
  type: 'apiKey',
  in: 'header',
  name: 'X-Enara-Timestamp',
  description: 'Unix timestamp signed by the ingestion HMAC',
};

const chapterSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'ch1' },
    title: { type: 'string', example: 'Algebra Foundations' },
    uploads: { type: 'array', items: { type: 'string' }, example: ['/uploads/file.pdf'] },
    description: { type: 'string' },
  },
};

const curriculumSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'CUR-ABC123-4567' },
    name: { type: 'string', example: 'National Curriculum - Grade 10' },
    courseName: { type: 'string', example: 'Secondary Education' },
    type: { type: 'string', enum: ['National', 'IGCSE', 'IB', 'American', 'Other'] },
    level: { type: 'string', example: 'Grade 10' },
    languages: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    description: { type: 'string' },
    lastUpdated: { type: 'string', format: 'date', example: '2024-02-15' },
    subjectsCount: { type: 'integer' },
    assignedBatches: { type: 'array', items: { type: 'string' } },
    chapters: { type: 'array', items: chapterSchema },
    status: { type: 'string', enum: ['draft', 'deployed'] },
    deploymentLink: { type: 'string' },
  },
};

const batchSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'b1700000000000' },
    name: { type: 'string', example: 'Batch A - 2024' },
    studentCount: { type: 'integer', example: 45 },
    curriculumId: { type: 'string' },
    academicYear: { type: 'string', example: '2023-2024' },
    groupId: { type: 'string', example: 'Group A' },
  },
};

const courseInstanceSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'inst-1700000000000' },
    courseId: { type: 'string', example: 'MATH101' },
    courseName: { type: 'string', example: 'Algebra Fundamentals' },
    academicYear: { type: 'string', example: '2023-2024' },
    batchId: { type: 'string' },
    curriculumId: { type: 'string' },
    groupId: { type: 'string' },
    studentIds: { type: 'array', items: { type: 'string' } },
  },
};

const studentSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'STU001' },
    name: { type: 'string', example: 'Sarah Ahmed' },
    email: { type: 'string', format: 'email' },
    grade: { type: 'string' },
    avatar: { type: 'string' },
    batchId: { type: 'string' },
    academicYear: { type: 'string' },
    groupId: { type: 'string' },
  },
};

const errorSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
    message: { type: 'string' },
  },
};

export function buildOpenApiSpec(serverUrl?: string): OpenAPIV3.Document {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Enara AI API',
      version: '1.2.0',
      description:
        'Curriculum Center (admin) + Student Me APIs including AI Tutor sessions.',
    },
    servers: [{ url: serverUrl || '/', description: 'API server' }],
    tags: [
      { name: 'Auth', description: 'Authentication' },
      { name: 'Me', description: 'Student profile and enrolled courses' },
      { name: 'Tutor', description: 'AI tutor sessions and messages' },
      { name: 'Assessments', description: 'Admin assessment CRUD' },
      { name: 'Curriculums', description: 'Upload and manage curriculums' },
      { name: 'Batches', description: 'Batch CRUD' },
      { name: 'Course Instances', description: 'Course instances and student assignment' },
      { name: 'Students', description: 'Admin student CRUD' },
      { name: 'Health', description: 'Service health' },
      { name: 'Upload', description: 'Upload files to S3 and AI engine' },
    ],
    components: {
      securitySchemes: { bearerAuth, ingestionHmac, ingestionTimestamp },
      schemas: {
        Curriculum: curriculumSchema,
        Batch: batchSchema,
        CourseInstance: courseInstanceSchema,
        Student: studentSchema,
        Chapter: chapterSchema,
        Error: errorSchema,
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            role: {
              type: 'string',
              enum: ['student'],
              description: 'Public registration only creates students; privileged roles require /api/auth/users.',
            },
          },
        },
        AdminCreateUserRequest: {
          type: 'object',
          required: ['email', 'password', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            role: { type: 'string', enum: ['student', 'teacher', 'admin', 'enara-admin'] },
            studentId: { type: 'string' },
            institutionId: { type: 'string' },
            schoolId: { type: 'string' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                role: { type: 'string' },
                name: { type: 'string' },
                studentId: { type: 'string' },
              },
            },
          },
        },
        CreateTutorSessionRequest: {
          type: 'object',
          properties: {
            courseId: { type: 'string', example: 'MATH101' },
            lessonId: { type: 'string', example: 'ch1' },
            title: { type: 'string' },
            teachingMethod: {
              type: 'string',
              enum: ['socratic', 'gap_filler', 'error_analysis'],
              example: 'socratic',
            },
          },
        },
        SendTutorMessageRequest: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', example: 'Explain the quadratic formula' },
            teachingMethod: {
              type: 'string',
              enum: ['socratic', 'gap_filler', 'error_analysis'],
            },
            context: {
              type: 'object',
              properties: {
                courseId: { type: 'string' },
                lessonId: { type: 'string' },
                subject: { type: 'string' },
                lessonTitle: { type: 'string' },
                curriculumSummary: { type: 'string' },
              },
            },
          },
        },
        CreateCurriculumRequest: {
          type: 'object',
          required: ['name', 'summary'],
          properties: {
            name: { type: 'string' },
            courseName: { type: 'string' },
            type: { type: 'string' },
            level: { type: 'string' },
            languages: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'deployed'] },
            chapters: { type: 'array', items: chapterSchema },
          },
        },
        CreateBatchRequest: {
          type: 'object',
          required: ['name', 'academicYear'],
          properties: {
            name: { type: 'string', example: 'Batch E - 2024' },
            studentCount: { type: 'integer', example: 0 },
            academicYear: { type: 'string', example: '2023-2024' },
            groupId: { type: 'string', example: 'Group A' },
          },
        },
        CreateInstanceRequest: {
          type: 'object',
          required: ['courseId', 'courseName', 'batchId', 'academicYear'],
          properties: {
            courseId: { type: 'string', example: 'MATH101' },
            courseName: { type: 'string', example: 'Algebra Fundamentals' },
            academicYear: { type: 'string', example: '2023-2024' },
            batchId: { type: 'string' },
            curriculumId: { type: 'string' },
            groupId: { type: 'string' },
          },
        },
        AssignBatchRequest: {
          type: 'object',
          required: ['batchId'],
          properties: { batchId: { type: 'string' } },
        },
        AssignStudentRequest: {
          type: 'object',
          required: ['studentId'],
          properties: { studentId: { type: 'string' } },
        },
        CreateStudentRequest: {
          type: 'object',
          required: ['name', 'email', 'grade'],
          properties: {
            name: { type: 'string', example: 'Sarah Ahmed', description: 'Full name' },
            email: { type: 'string', format: 'email', example: 'student@school.edu' },
            grade: { type: 'string', example: 'Grade 10', description: 'Grade level' },
            batchId: { type: 'string', description: 'Optional batch assignment' },
            academicYear: { type: 'string', example: '2023-2024' },
            groupId: { type: 'string', example: 'Group A' },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      service: { type: 'string', example: 'enara-ai-be' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness check',
          responses: {
            '200': { description: 'Critical dependencies are ready' },
            '503': { description: 'One or more critical dependencies are unavailable' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login (creates user on first login)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
          },
          responses: {
            '200': {
              description: 'Authenticated',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
            },
            '401': { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Public student registration',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
          },
          responses: {
            '201': {
              description: 'User created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
            },
            '409': { description: 'User already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/users': {
        post: {
          tags: ['Auth'],
          summary: 'Authorized account creation',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCreateUserRequest' } } },
          },
          responses: {
            '201': { description: 'User created' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Insufficient role' },
            '409': { description: 'User already exists' },
          },
        },
      },
      '/api/curriculums': {
        get: {
          tags: ['Curriculums'],
          summary: 'List curriculums',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'e.g. National, IGCSE' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'deployed', 'All Status'] } },
          ],
          responses: {
            '200': {
              description: 'Curriculum list',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Curriculum' } } } },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        post: {
          tags: ['Curriculums'],
          summary: 'Upload / create curriculum',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCurriculumRequest' } } },
          },
          responses: {
            '201': {
              description: 'Curriculum created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Curriculum' } } },
            },
          },
        },
      },
      '/api/curriculums/{id}': {
        get: {
          tags: ['Curriculums'],
          summary: 'Get curriculum by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Curriculum', content: { 'application/json': { schema: { $ref: '#/components/schemas/Curriculum' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        patch: {
          tags: ['Curriculums'],
          summary: 'Update curriculum',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCurriculumRequest' } } },
          },
          responses: {
            '200': { description: 'Updated curriculum', content: { 'application/json': { schema: { $ref: '#/components/schemas/Curriculum' } } } },
          },
        },
        delete: {
          tags: ['Curriculums'],
          summary: 'Delete curriculum',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deleted' } },
        },
      },
      '/api/curriculums/{id}/deploy': {
        patch: {
          tags: ['Curriculums'],
          summary: 'Deploy curriculum',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Deployed curriculum', content: { 'application/json': { schema: { $ref: '#/components/schemas/Curriculum' } } } },
          },
        },
      },
      '/api/curriculums/{id}/batches': {
        get: {
          tags: ['Curriculums'],
          summary: 'List batches for curriculum assignment',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Batches with assignment status',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      allOf: [
                        { $ref: '#/components/schemas/Batch' },
                        { type: 'object', properties: { isAssigned: { type: 'boolean' } } },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/curriculums/{id}/assign-batch': {
        post: {
          tags: ['Curriculums'],
          summary: 'Assign curriculum to batch',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignBatchRequest' } } },
          },
          responses: { '200': { description: 'Assignment updated' } },
        },
      },
      '/api/curriculums/{id}/batches/{batchId}': {
        delete: {
          tags: ['Curriculums'],
          summary: 'Unassign batch from curriculum',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'batchId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Unassigned' } },
        },
      },
      '/api/curriculums/{id}/chapters/{chapterId}/uploads': {
        post: {
          tags: ['Curriculums'],
          summary: 'Upload chapter file',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
          responses: { '200': { description: 'File uploaded' } },
        },
        delete: {
          tags: ['Curriculums'],
          summary: 'Remove chapter upload',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'uploadPath', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Upload removed' } },
        },
      },
      '/api/batches': {
        get: {
          tags: ['Batches'],
          summary: 'List batches',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'filter', in: 'query', schema: { type: 'string', enum: ['all', 'assigned', 'unassigned'] } },
          ],
          responses: {
            '200': {
              description: 'Batch list',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Batch' } } } },
            },
          },
        },
        post: {
          tags: ['Batches'],
          summary: 'Create batch',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBatchRequest' } } },
          },
          responses: {
            '201': {
              description: 'Batch created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } },
            },
          },
        },
      },
      '/api/batches/{id}': {
        get: {
          tags: ['Batches'],
          summary: 'Get batch',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Batch', content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } } },
          },
        },
        patch: {
          tags: ['Batches'],
          summary: 'Update batch',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBatchRequest' } } },
          },
          responses: {
            '200': { description: 'Updated batch', content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } } },
          },
        },
        delete: {
          tags: ['Batches'],
          summary: 'Delete batch',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Batch deleted' } },
        },
      },
      '/api/course-instances': {
        get: {
          tags: ['Course Instances'],
          summary: 'List course instances',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'year', in: 'query', schema: { type: 'string' } },
            { name: 'batchId', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Instance list',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CourseInstance' } } } },
            },
          },
        },
        post: {
          tags: ['Course Instances'],
          summary: 'Create course instance',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInstanceRequest' } } },
          },
          responses: {
            '201': {
              description: 'Instance created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseInstance' } } },
            },
          },
        },
      },
      '/api/course-instances/{id}': {
        get: {
          tags: ['Course Instances'],
          summary: 'Get course instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Instance', content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseInstance' } } } },
          },
        },
        patch: {
          tags: ['Course Instances'],
          summary: 'Update course instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInstanceRequest' } } },
          },
          responses: { '200': { description: 'Updated instance' } },
        },
        delete: {
          tags: ['Course Instances'],
          summary: 'Delete course instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Instance deleted' } },
        },
      },
      '/api/course-instances/{id}/available-students': {
        get: {
          tags: ['Course Instances'],
          summary: 'Students available to assign to instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Available students',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } } } },
            },
          },
        },
      },
      '/api/course-instances/{id}/students': {
        get: {
          tags: ['Course Instances'],
          summary: 'Students assigned to instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Assigned students',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } } } },
            },
          },
        },
        post: {
          tags: ['Course Instances'],
          summary: 'Assign student to instance',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignStudentRequest' } } },
          },
          responses: {
            '200': { description: 'Student assigned', content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseInstance' } } } },
          },
        },
      },
      '/api/course-instances/{id}/students/{studentId}': {
        delete: {
          tags: ['Course Instances'],
          summary: 'Remove student from instance',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'studentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Student removed' } },
        },
      },
      '/api/students': {
        get: {
          tags: ['Students'],
          summary: 'List students',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'batchId', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'grade', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Student list',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } } } },
            },
          },
        },
        post: {
          tags: ['Students'],
          summary: 'Create student',
          description: 'Add a new student with full name, email, and grade level.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStudentRequest' } } },
          },
          responses: {
            '201': {
              description: 'Student created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } },
            },
            '409': { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/students/{id}': {
        get: {
          tags: ['Students'],
          summary: 'Get student by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Student', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        patch: {
          tags: ['Students'],
          summary: 'Update student',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStudentRequest' } } },
          },
          responses: {
            '200': { description: 'Updated student', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
          },
        },
        delete: {
          tags: ['Students'],
          summary: 'Delete student',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Student deleted' } },
        },
      },
      '/api/me': {
        get: {
          tags: ['Me'],
          summary: 'Get current student profile',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Student profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
            '403': { description: 'Student access required' },
          },
        },
      },
      '/api/me/courses': {
        get: {
          tags: ['Me'],
          summary: 'List enrolled courses',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Enrolled courses' } },
        },
      },
      '/api/me/courses/{courseId}': {
        get: {
          tags: ['Me'],
          summary: 'Get enrolled course with lessons',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Course tree with modules/lessons' } },
        },
      },
      '/api/me/courses/{courseId}/lessons/{lessonId}': {
        get: {
          tags: ['Me'],
          summary: 'Get lesson detail',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Lesson detail with curriculum context' } },
        },
      },
      '/api/me/courses/{courseId}/lessons/{lessonId}/complete': {
        post: {
          tags: ['Me'],
          summary: 'Mark lesson complete',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Updated course progress' } },
        },
      },
      '/api/me/tutor/sessions': {
        get: {
          tags: ['Tutor'],
          summary: 'List tutor chat sessions',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'courseId', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { '200': { description: 'Tutor sessions' } },
        },
        post: {
          tags: ['Tutor'],
          summary: 'Create tutor session',
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTutorSessionRequest' } } },
          },
          responses: { '201': { description: 'Session created' } },
        },
        delete: {
          tags: ['Tutor'],
          summary: 'Clear all tutor sessions',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'courseId', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Sessions cleared' } },
        },
      },
      '/api/me/tutor/sessions/{id}': {
        get: {
          tags: ['Tutor'],
          summary: 'Get tutor session with messages',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Tutor session' } },
        },
        delete: {
          tags: ['Tutor'],
          summary: 'Delete tutor session',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deleted' } },
        },
      },
      '/api/me/tutor/sessions/{id}/messages': {
        post: {
          tags: ['Tutor'],
          summary: 'Send tutor message',
          description:
            'Sends a student message, proxies Enara Modal /chat/query when possible, and returns the AI reply.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SendTutorMessageRequest' } } },
          },
          responses: { '200': { description: 'User + assistant messages' } },
        },
      },
      '/api/me/tutor/sessions/{id}/messages/stream': {
        post: {
          tags: ['Tutor'],
          summary: 'Stream tutor message (SSE)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SendTutorMessageRequest' } } },
          },
          responses: { '200': { description: 'text/event-stream tokens' } },
        },
      },
      '/api/me/tutor/visualize': {
        post: {
          tags: ['Tutor'],
          summary: 'Request tutor visualization',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['prompt'],
                  properties: {
                    prompt: { type: 'string' },
                    courseId: { type: 'string' },
                    lessonTitle: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Visualization payload' } },
        },
      },
      '/api/me/tutor/tts': {
        post: {
          tags: ['Tutor'],
          summary: 'Text-to-speech for tutor reply',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: { text: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'TTS payload' } },
        },
      },
      '/api/me/dashboard': {
        get: {
          tags: ['Me'],
          summary: 'Student dashboard aggregate',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Dashboard payload' } },
        },
      },
      '/api/me/study-plans': {
        post: {
          tags: ['Me'],
          summary: 'Generate personalized study plan',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Study plan' } },
        },
      },
      '/api/me/achievements': {
        get: {
          tags: ['Me'],
          summary: 'Student achievements',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Achievement list' } },
        },
      },
      '/api/me/credits': {
        get: {
          tags: ['Me'],
          summary: 'Student AI credit balance',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Credits' } },
        },
      },
      '/api/me/learning-engine': {
        get: {
          tags: ['Me'],
          summary: 'Learning engine profile',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Learning engine + adaptive profile' } },
        },
      },
      '/api/me/recommendations': {
        get: {
          tags: ['Me'],
          summary: 'Risk + next best actions',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Recommendations' } },
        },
      },
      '/api/me/analytics/overview': {
        get: {
          tags: ['Me'],
          summary: 'Analytics overview',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Overview metrics' } },
        },
      },
      '/api/me/analytics/subjects': {
        get: {
          tags: ['Me'],
          summary: 'Subject analytics',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Subjects list' } },
        },
      },
      '/api/me/assessments': {
        get: {
          tags: ['Me'],
          summary: 'List assigned assessments',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Assessments' } },
        },
      },
      '/api/me/assessments/{id}': {
        get: {
          tags: ['Me'],
          summary: 'Get assessment (answers hidden)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Assessment + attempt' } },
        },
      },
      '/api/me/assessments/{id}/attempts': {
        post: {
          tags: ['Me'],
          summary: 'Start assessment attempt',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '201': { description: 'Attempt started' } },
        },
      },
      '/api/me/assessments/{id}/attempts/{attemptId}/submit': {
        post: {
          tags: ['Me'],
          summary: 'Submit assessment answers',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'attemptId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    answers: { type: 'object', additionalProperties: true },
                    timeSpentSec: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Graded result' } },
        },
      },
      '/api/me/results': {
        get: {
          tags: ['Me'],
          summary: 'List submitted results',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Results' } },
        },
      },
      '/api/me/results/analytics': {
        get: {
          tags: ['Me'],
          summary: 'Results analytics',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Topic/subject analytics' } },
        },
      },
      '/api/ingestion/submit': {
        post: {
          tags: ['Upload'],
          summary: 'Submit an uploaded asset to the ingestion engine',
          security: [{ ingestionHmac: [], ingestionTimestamp: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['schoolId', 'courseId', 'instructorId', 'assetId', 's3Key'],
                  properties: {
                    schoolId: { type: 'string' },
                    courseId: { type: 'string' },
                    instructorId: { type: 'string' },
                    assetId: { type: 'string' },
                    s3Key: { type: 'string' },
                    modality: { type: 'string', enum: ['document', 'audio'] },
                    fileName: { type: 'string' },
                    fileSize: { type: 'integer' },
                    createdByUserId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Ingestion job accepted' },
            '401': { description: 'Missing, stale, or invalid service signature' },
          },
        },
      },
      '/api/ingestion/callback': {
        post: {
          tags: ['Upload'],
          summary: 'Receive authenticated ingestion status callbacks',
          security: [{ ingestionHmac: [], ingestionTimestamp: [] }],
          responses: {
            '200': { description: 'Callback accepted' },
            '401': { description: 'Missing, stale, or invalid service signature' },
            '409': { description: 'Invalid ingestion state transition' },
          },
        },
      },
      '/api/ingestion/status/{eventId}': {
        get: {
          tags: ['Upload'],
          summary: 'Read tenant-scoped ingestion job status',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Ingestion status' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Insufficient role' },
            '404': { description: 'Not found or outside tenant scope' },
          },
        },
      },
      '/api/upload/course/{courseId}': {
        post: {
          tags: ['Upload'],
          summary: 'Upload a file to S3 and submit to AI engine',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    schoolId: { type: 'string' },
                    institutionId: { type: 'string' },
                    assetId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'File uploaded and submitted to AI engine' },
            '400': { description: 'Missing or invalid upload metadata' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Insufficient role, institution scope, or course permission' },
            '413': { description: 'File too large' },
            '415': { description: 'Unsupported file type' },
            '502': { description: 'Storage or ingestion dependency error' },
          },
        },
      },
      '/api/assessments': {
        get: {
          tags: ['Assessments'],
          summary: 'Admin list assessments',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Assessments' } },
        },
        post: {
          tags: ['Assessments'],
          summary: 'Admin create assessment',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Created' } },
        },
      },
    },
  };
}
