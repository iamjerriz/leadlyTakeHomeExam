import { Router } from 'express';
import * as itemsController from '../controllers/items.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { createItemSchema, itemIdParamSchema } from '../validation/schemas';

const router = Router();

router.post('/', validate(createItemSchema, 'body'), asyncHandler(itemsController.createItem));
router.get('/:id', validate(itemIdParamSchema, 'params'), asyncHandler(itemsController.getItem));

export default router;
