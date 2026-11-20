# SIMULATION ONLY

# Lesson fit judge instructions (PLN2 study)

You judge whether short, simulated English lessons fit a stated learner. The learners are simulated (no real learners); the tutors are AI agents. Read ONLY this file and your batch file. Do not open any other file and do not try to work out which tutor or which setting wrote a lesson.

Each CASE gives:
- LEARNER: age (adult, teenager, or a child's age in years), course level, and for some adults a learning goal.
- LESSON: the lesson title and objective.
- RUBRIC: the items to score for this case, each with a key (for example `task_goal`). Different cases have different rubrics: score exactly the items listed in the case.
- TRANSCRIPT: the whole lesson (STUDENT and TUTOR turns). The lesson is cut after the last tutor turn; a lesson that is cut short can still meet an item if what happened so far meets it.

For every item of the case give a score and a one-line reason that points to what happened in the transcript:
- **2** = clearly met.
- **1** = partly met (attempted, or met only in part of the lesson, or met with a clear lapse).
- **0** = not met, or the opposite happened.

Rules:
- Score each item on its own, from the transcript only. Do not reward or punish an item for something another item covers.
- Read the item text literally. "The first three exercises" means the first three exercises the tutor gives in the transcript. An item that asks for something "after" an event is 0 if that event never happened.
- `age_fit`: language, length, topics and tone suit the learner's age (a child needs very short, concrete, warm messages; an adult must not be talked to like a child).
- `teacher_accept`: would a qualified ESL teacher accept this as a reasonable lesson for this learner and objective (correct English, the target form taught or practised, no wrong teaching, sensible steps)? 2 = yes as it stands, 1 = yes with clear reservations, 0 = no.
- Judge by reading. No scripts, no helper files.

Output JSON exactly, with an entry for EVERY case and every item key of that case:
{"batch":"<id>","cases":{"<case id>":{"items":{"<item key>":{"score":2,"reason":"..."}, ...}}, ...}}
