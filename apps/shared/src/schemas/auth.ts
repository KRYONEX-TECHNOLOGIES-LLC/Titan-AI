export const loginRequestSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 12 }
  },
  required: ['email', 'password'],
  additionalProperties: false
};