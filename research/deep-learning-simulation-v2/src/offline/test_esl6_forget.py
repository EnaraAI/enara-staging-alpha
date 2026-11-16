# SIMULATION ONLY. NO API.  Unit tests for esl6_forget.py (F1 + section 2a).  Run: python3 -m unittest src/offline/test_esl6_forget.py -v
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import esl6_forget as F  # noqa: E402


def worked(retrieved=False, w1_removed=False):
    k = F.initial_state('copula', 'A1', 'W1'); k['sec1'] = 'copula'
    k['s'].update({'C1': 2.0, 'W1': 0 if w1_removed else 1}); k['indep']['C1'] = 2 if w1_removed else 1
    if retrieved: k['retr']['C1'] = [2]
    return k


class Params(unittest.TestCase):
    def test_params_match_rules(self):
        self.assertEqual((F.BASE, F.MULT, F.R_CAP, F.FRAC, F.CAP, F.THRESH, F.MIN_ERR, F.DAYS_GAP, F.DAYS_DELAY), (0.15, 0.5, 2, 0.10, 0.5, 1.0, 0.4, 2, 7))
        self.assertEqual([F.decay_rate(r) for r in (0, 1, 2, 3)], [0.15, 0.075, 0.0375, 0.0375])


class WorkedExample(unittest.TestCase):
    def test_day7_not_retrieved(self):
        d = F.f1_gap(worked(), 7); self.assertAlmostEqual(d['s']['C1'], 0.95); self.assertAlmostEqual(d['s']['W1'], 2.0)

    def test_day7_retrieved_once(self):
        d = F.f1_gap(worked(True), 7); self.assertAlmostEqual(d['s']['C1'], 1.475); self.assertAlmostEqual(d['s']['W1'], 2.0)

    def test_intermediate_days(self):
        for days, c0, c1, w in ((1, 1.85, 1.925, 1.2), (3, 1.55, 1.775, 1.6), (5, 1.25, 1.625, 2.0)):
            self.assertAlmostEqual(F.f1_gap(worked(), days)['s']['C1'], c0); self.assertAlmostEqual(F.f1_gap(worked(True), days)['s']['C1'], c1)
            self.assertAlmostEqual(F.f1_gap(worked(), days)['s']['W1'], w)

    def test_removed_w1_and_threshold(self):
        a, b = F.f1_gap(worked(False, True), 7), F.f1_gap(worked(True, True), 7)
        self.assertEqual(a['s']['W1'], 0); self.assertEqual(b['s']['W1'], 0)
        self.assertAlmostEqual(F.item_error_prob(a, 'W1'), 0.4); self.assertAlmostEqual(F.item_error_prob(b, 'W1'), 0.05)
        self.assertAlmostEqual(F.item_error_prob(F.f1_gap(worked(), 7), 'W1'), 0.8)


class Decay(unittest.TestCase):
    def test_floor_a2_c1(self):
        k = F.initial_state('x', 'A2', 'W1'); k['s']['C1'] = 1.3; self.assertEqual(F.f1_gap(k, 7)['s']['C1'], 1)

    def test_b2_no_decay(self):
        k = F.initial_state('x', 'B2', 'W1'); d = F.f1_gap(k, 7); self.assertEqual(d['s'], k['s'])

    def test_never_learned_never_forgotten(self):
        k = F.initial_state('x', 'A1', 'W1'); d = F.f1_gap(k, 7); self.assertEqual(d['s'], k['s'])

    def test_session1_retrieval_not_counted_and_cap(self):
        k = worked(); k['retr']['C1'] = [1]; self.assertEqual(F.r_of(k, 'C1'), 0)
        k['retr']['C1'] = [2, 3, 4]; self.assertEqual(F.r_of(k, 'C1'), 2)

    def test_retrieval_once_per_session(self):
        k = worked(); last = {'kind': 'blank', 'correct': True}
        k, _, _ = F.apply_events(k, [], last, session=2, retrieval=['C1']); k, _, _ = F.apply_events(k, [], last, session=2, retrieval=['C1'])
        self.assertEqual(k['retr']['C1'], [2]); self.assertEqual(F.r_of(k, 'C1'), 1)
        k1, _, rej = F.apply_events(worked(), [], last, session=1, retrieval=['C1']); self.assertEqual(k1['retr']['C1'], []); self.assertTrue(rej)


class Return(unittest.TestCase):
    def test_cap_half_drop_and_not_above_start(self):
        k = F.initial_state('x', 'A1', 'W1'); k['s']['W1'] = 0.0; k['indep']['C1'] = 1   # drop 3, cap 1.5
        self.assertAlmostEqual(F.f1_gap(k, 2)['s']['W1'], 0.6); self.assertAlmostEqual(F.f1_gap(k, 7)['s']['W1'], 1.5)
        k['s']['W2'] = 0.0                                                               # W2 start 1: drop 1, cap 0.5
        self.assertAlmostEqual(F.f1_gap(k, 7)['s']['W2'], 0.5)

    def test_cap_resets_per_gap(self):
        k = F.initial_state('x', 'A1', 'W1'); k['s']['W1'] = 1.0                          # drop 2
        g1 = F.f1_gap(k, 2); self.assertAlmostEqual(g1['s']['W1'], 1.4)                 # new drop from 1.4 = 1.6
        self.assertAlmostEqual(F.f1_gap(g1, 7)['s']['W1'], 2.2)                          # +0.8 cap

    def test_raised_by_r7_unchanged(self):
        k = F.initial_state('x', 'A2', 'W1'); k['s']['W2'] = 2; self.assertEqual(F.f1_gap(k, 7)['s']['W2'], 2)

    def test_removed_does_not_return(self):
        k = F.initial_state('x', 'A1', 'W1'); k, _, _ = F.apply_events(k, [{'rule': 'R4', 'belief': 'C1'}], {'kind': 'blank', 'correct': True})
        k, _, _ = F.apply_events(k, [{'rule': 'R4', 'belief': 'C1'}], {'kind': 'blank', 'correct': True})
        self.assertEqual(k['s']['W1'], 0); self.assertEqual(F.f1_gap(k, 7)['s']['W1'], 0)


class Answering(unittest.TestCase):
    def test_rounding_half_up(self):
        self.assertEqual([F.p_wrong(x) for x in (0, 0.49, 0.5, 1, 1.49, 1.5, 2, 3)], [0.05, 0.05, 0.4, 0.4, 0.4, 0.8, 0.8, 0.8])

    def test_threshold_only_after_f1(self):
        k = F.initial_state('x', 'A1', 'W1'); k['s']['W1'] = 0
        self.assertEqual(F.item_error_prob(k, 'W1'), 0.05); k['afterF1'] = True; self.assertEqual(F.item_error_prob(k, 'W1'), 0.4)
        k['s']['C1'] = 1.0; self.assertEqual(F.item_error_prob(k, 'W1'), 0.05)

    def test_one_belief_outcome_probes(self):
        k = F.initial_state('x', 'A1', 'W1', ws=['W1']); self.assertEqual(k['s']['W2'], 0); self.assertEqual(F.post_probes(k), [['W1']] * 6)
        self.assertAlmostEqual(F.expected_acc(k), 0.2)

    def test_r1_from_fraction_to_zero(self):
        k = F.initial_state('x', 'A1', 'W1'); k['s']['W1'] = 0.3
        k, _, _ = F.apply_events(k, [{'rule': 'R1', 'belief': 'W1'}], None); self.assertEqual(k['s']['W1'], 0)

    def test_deterministic(self):
        k = F.initial_state('x', 'A1', 'W1'); self.assertEqual(F.produce(k, ['W1', 'W2'], 's', 'prod', 1, 'i'), F.produce(k, ['W1', 'W2'], 's', 'prod', 1, 'i'))
        self.assertEqual(F.f1_gap(worked(), 7), F.f1_gap(worked(), 7))


if __name__ == '__main__':
    unittest.main()
