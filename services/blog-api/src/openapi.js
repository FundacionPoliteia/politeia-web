export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Politeia Blog API',
    version: '1.0.0',
  },
  servers: [{ url: '/v1' }],
  components: {
    securitySchemes: {
      googleIdToken: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Google ID Token',
      },
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'politeia_session',
      },
    },
    schemas: {
      Post: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          excerpt: { type: 'string' },
          contentMarkdown: { type: 'string' },
          contentHtml: { type: 'string' },
          coverImage: { type: 'string', nullable: true },
          coverImageThumbnail: { type: 'string', nullable: true },
          showCoverInPost: { type: 'boolean' },
          status: { type: 'string', enum: ['draft', 'review', 'published', 'archived'] },
          authorEmail: { type: 'string' },
          authorName: { type: 'string' },
          authorNote: { type: 'string' },
          showAuthorNote: { type: 'boolean' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          publicationDate: { type: 'string', format: 'date', nullable: true },
          editRequestedAt: { type: 'string', format: 'date-time', nullable: true },
          editRequestedBy: { type: 'string' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          key: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
  },
  paths: {
    '/auth/google': {
      post: {
        summary: 'Create a persistent session from a Google ID token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['credential'],
                properties: {
                  credential: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Session created' } },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Clear the persistent session cookie',
        responses: { 200: { description: 'Session cleared' } },
      },
    },
    '/categories': {
      get: {
        summary: 'List shared blog categories',
        security: [{ googleIdToken: [] }],
        responses: { 200: { description: 'Shared categories' } },
      },
      post: {
        summary: 'Create or restore a shared blog category',
        security: [{ googleIdToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Category created' } },
      },
    },
    '/categories/{id}': {
      delete: {
        summary: 'Delete a shared blog category',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Category deleted' } },
      },
    },
    '/posts': {
      get: {
        summary: 'List published posts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', default: 'published' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Published posts' } },
      },
      post: {
        summary: 'Create draft post',
        security: [{ googleIdToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'contentMarkdown'],
                properties: {
                  title: { type: 'string' },
                  slug: { type: 'string' },
                  publicationDate: { type: 'string', format: 'date' },
                  excerpt: { type: 'string' },
                  contentMarkdown: { type: 'string' },
                  coverImage: { type: 'string' },
                  coverImageThumbnail: { type: 'string' },
                  showCoverInPost: { type: 'boolean' },
                  authorName: { type: 'string' },
                  authorNote: { type: 'string' },
                  showAuthorNote: { type: 'boolean' },
                  authorEmail: { type: 'string' },
                  category: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Draft created' } },
      },
    },
    '/posts/{slug}': {
      get: {
        summary: 'Get published post by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Published post' }, 404: { description: 'Not found' } },
      },
    },
    '/posts/manage': {
      get: {
        summary: 'List manageable posts',
        security: [{ googleIdToken: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: { 200: { description: 'Manageable posts' } },
      },
    },
    '/posts/{id}': {
      patch: {
        summary: 'Update post',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated post' } },
      },
      delete: {
        summary: 'Soft delete post',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted post' } },
      },
    },
    '/posts/{id}/submit-review': {
      post: {
        summary: 'Move post to review',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Post moved to review' } },
      },
    },
    '/posts/{id}/request-edit': {
      post: {
        summary: 'Request edit access for a published post',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Edit request registered' } },
      },
    },
    '/posts/{id}/enable-edit': {
      post: {
        summary: 'Move a published post back to draft for editing',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Post moved to draft' } },
      },
    },
    '/posts/{id}/publish': {
      post: {
        summary: 'Publish post',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Post published' } },
      },
    },
    '/posts/{id}/archive': {
      post: {
        summary: 'Archive post',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Post archived' } },
      },
    },
    '/notifications/inbox': {
      get: {
        summary: 'List in-app editorial notifications for current user',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }],
        responses: { 200: { description: 'In-app notification inbox' } },
      },
    },
    '/notifications/{eventId}/read': {
      patch: {
        summary: 'Mark one in-app notification as read',
        security: [{ googleIdToken: [] }],
        parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification marked as read' } },
      },
    },
    '/notifications/read-all': {
      post: {
        summary: 'Mark all visible in-app notifications as read',
        security: [{ googleIdToken: [] }],
        responses: { 200: { description: 'Notifications marked as read' } },
      },
    },
    '/admin/logs/requests': {
      get: {
        summary: 'List sanitized API request logs (admin only)',
        security: [{ sessionCookie: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 250, maximum: 500 } }],
        responses: { 200: { description: 'Recent API request logs' }, 403: { description: 'Admin role required' } },
      },
    },
    '/admin/logs/mail': {
      get: {
        summary: 'List sanitized mail delivery logs (admin only)',
        security: [{ sessionCookie: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 500 } }],
        responses: { 200: { description: 'Recent mail delivery logs' }, 403: { description: 'Admin role required' } },
      },
    },
    '/admin/logs/resend-test': {
      post: {
        summary: 'Send a Resend test email to the authenticated admin',
        security: [{ sessionCookie: [] }],
        responses: { 200: { description: 'Test accepted by the provider' }, 403: { description: 'Admin role required' } },
      },
    },
    '/media': {
      post: {
        summary: 'Upload image or register external image URL',
        security: [{ googleIdToken: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Media registered' } },
      },
    },
    '/import/docx': {
      post: {
        summary: 'Import a DOCX document into editable blog content',
        security: [{ googleIdToken: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Imported content',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    contentMarkdown: { type: 'string' },
                    contentHtml: { type: 'string' },
                    warnings: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
