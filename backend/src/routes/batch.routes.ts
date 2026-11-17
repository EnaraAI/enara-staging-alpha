import { Router } from 'express';
import {
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  deleteBatch,
} from '../controllers/batch.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
import { archiveGroupHandler, groupHistory, guardGroupDelete, onlyWhen, restoreGroupHandler } from '../controllers/archive.controller';
import { groupArchiveOn } from '../services/archive';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listBatches);
router.get('/:id', getBatch);
router.post('/', createBatch);
router.patch('/:id', updateBatch);
router.delete('/:id', guardGroupDelete, deleteBatch);
// Multi-class step 6 archiving (ENROLLMENT_GROUP_ARCHIVE; skipped while off).
router.post('/:id/archive', onlyWhen(groupArchiveOn), archiveGroupHandler);
router.post('/:id/restore', onlyWhen(groupArchiveOn), restoreGroupHandler);
router.get('/:id/history', onlyWhen(groupArchiveOn), groupHistory);

export default router;
