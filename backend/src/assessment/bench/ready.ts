import { isAiConfigured } from '../../services/aiJson';
import { engineV2 } from '../../services/engineV2';

/** The bench grades only when the engine's open grading is switched on and a model is configured (else every answer is a miss). */
export const engineModelReadyForBench = (): boolean => engineV2('assessGrading') && isAiConfigured();
