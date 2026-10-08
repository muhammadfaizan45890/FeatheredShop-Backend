import { body, param, query } from 'express-validator';

export const createPostValidation = [
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('category').notEmpty().withMessage('Category is required'),
  body('images')
    .isArray({ min: 1 })
    .withMessage('At least one image is required')
    .custom((images) => images.every((url) => typeof url === 'string' && url.startsWith('http')))
    .withMessage('Each image must be a valid URL'),
  body('description').notEmpty().withMessage('Description is required').isLength({ max: 5000 }),
];

export const updatePostValidation = [
  param('id').isMongoId().withMessage('Invalid post ID'),
  body('title').optional().isLength({ max: 200 }),
  body('category').optional(),
  body('images').optional().isArray({ min: 1 }).custom((images) => images.every((url) => typeof url === 'string' && url.startsWith('http'))),
  body('description').optional().isLength({ max: 5000 }),
  body('isPublished').optional().isBoolean(),
];

export const idParamValidation = [
  param('id').isMongoId().withMessage('Invalid post ID'),
];

export const queryValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['asc', 'desc']),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('published').optional().isBoolean(),
];