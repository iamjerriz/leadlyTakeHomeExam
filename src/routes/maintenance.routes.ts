import { Router } from 'express';
import * as maintenanceController from '../controllers/maintenance.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post('/expire-reservations', asyncHandler(maintenanceController.expireReservations));

export default router;
