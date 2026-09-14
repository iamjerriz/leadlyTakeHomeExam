import { Router } from 'express';
import * as reservationsController from '../controllers/reservations.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { createReservationSchema, reservationIdParamSchema } from '../validation/schemas';

const router = Router();

router.post('/', validate(createReservationSchema, 'body'), asyncHandler(reservationsController.createReservation));
router.get(
  '/:id',
  validate(reservationIdParamSchema, 'params'),
  asyncHandler(reservationsController.getReservation),
);
router.post(
  '/:id/confirm',
  validate(reservationIdParamSchema, 'params'),
  asyncHandler(reservationsController.confirmReservation),
);
router.post(
  '/:id/cancel',
  validate(reservationIdParamSchema, 'params'),
  asyncHandler(reservationsController.cancelReservation),
);

export default router;
