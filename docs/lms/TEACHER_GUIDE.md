# ENARA in Moodle: guide for teachers and schools

This guide is for teachers and school admins who add ENARA activities to a Moodle course. The menu names are for Moodle 4.x.

## Adding ENARA to your course

In your Moodle course, turn editing on, add an **ENARA** activity (External tool), and click **Select content**. The ENARA picker opens in your language (English or Arabic). Pick one or more items and click **Add**. Moodle creates one activity per item.

### The ENARA course link (one link for everyone)

Pick **ENARA home (course link)**. Add it once, for example at the top of the course. Everyone uses the same link, and ENARA opens the right page for each person:
- a **student** opens their ENARA home (dashboard), in this course's class;
- a **teacher** opens the **Teaching Dashboard** for this course's class.

The course link has no grade. If Moodle shows a grade column for it, you can ignore it or remove it (see "Activities that are really ungraded" below).

### Links to ENARA pages

Under **ENARA pages** you can add a direct link to one page, for example **My progress** or **Grading**. These links have no grade.

- **Student pages:** My learning, My progress, My assignments, Study plan, My results.
- **Teacher pages** (badge **Teachers only**): Teaching Dashboard, Class assignments, Grading, Class insights, Lesson planner, Assessment builder, Curriculum. Teacher pages open for this course's class where the page has a class.

**Hide teacher-only links from students.** In Moodle, hide a teacher-only link from students, or make it **available but not shown on the course page** (in Moodle 4.x: the activity's **Availability** setting, "Make available but don't show on course page", if your site allows it). If a student opens a teacher-only link anyway, ENARA opens **their own home**; they never see a teacher page.

### Due dates

When you pick a quiz, test or assignment, you can give it a **due date** (optional). Enter the date and time in **your school's time** (for example Cairo time); the picker shows which time zone it uses. The date must be in the future and within 2 years.

- The due date is **stored in ENARA**: it becomes the due date of the ENARA assignment the first time the activity is opened. Without a date, the activity stays open for a year, as before.
- Moodle's activity has no due-date field, so ENARA also adds one line to the activity's **description** in Moodle when the activity is created, in your language, for example "Due: 25 Nov 2026, 11:59 PM (Cairo time)" or "موعد التسليم: 25 نوفمبر 2026، 11:59 م (توقيت القاهرة)".
- **To change the date later, change it in ENARA** (Class assignments). ENARA uses the new date. The line in Moodle's description is **not** updated: edit or remove it in Moodle yourself if you change the date.

## Grades from ENARA activities

### What ENARA sends

- **Every ENARA activity has its own grade column** in the Moodle gradebook, out of 100.
- **Quizzes and tests** send the student's **latest** released result.
- **Practice** also sends a grade (owner decision D3). It sends the student's **best** attempt, so a weaker later try never lowers it. This includes practice activities added before this change.
- Grades go to Moodle automatically after each attempt. You do not need to do anything in ENARA.

### If practice should not count in the course total

Practice has its own column, so it counts in the course total unless you change it. To keep the column but give it no weight (Natural aggregation, Moodle's default):

1. In your course, click **Grades** in the course navigation.
2. In the drop-down menu at the top left, choose **Gradebook setup**.
3. Find the practice activity's row. In the **Weights** column, tick the checkbox next to its weight. The number can now be edited.
4. Type **0**.
5. Click **Save changes** at the bottom of the page.

Students still see their practice score in its column. It no longer counts in the course total, and Moodle shares the weight among the other items.

Two related settings:
- **Exclude empty grades** (on the course category's settings, **on** by default): a student who has not done the practice yet is not given 0 for it.
- **Hiding** the grade item (its **⋮** menu › **Hide**) only hides it from students. It does not take it out of the course total.

### Activities that are really ungraded

Moodle creates a grade column for every external tool activity. For an ENARA activity that should have no grade at all (the ENARA course link, links to ENARA pages, and later tutor sessions or the avatar), remove the column in Moodle. ENARA never sends a grade for these. Open the activity, then go to **Settings** › **Grade** › **Type**, choose **None**, and click **Save and return to course**.

### A cell marked (*) is "overridden"

If you typed a grade into the gradebook yourself, Moodle marks the cell as overridden. Moodle then **ignores every grade ENARA sends to that cell**. In ENARA, the grade shows as "Changed in LMS".

To let ENARA's grades through again:

1. Go to **Grades**, and in the drop-down menu choose **Single view**.
2. Choose the ENARA grade item.
3. On the student's row, untick **Override**.
4. Click **Save**.

The next grade ENARA sends will fill the cell.
