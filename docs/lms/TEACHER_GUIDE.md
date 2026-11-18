# ENARA in Moodle: guide for teachers and schools

This guide is for teachers and school admins who add ENARA activities to a Moodle course. The menu names are for Moodle 4.x.

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

Moodle creates a grade column for every external tool activity. For an ENARA activity that should have no grade at all (later: tutor sessions or the avatar), remove the column in Moodle. Open the activity, then go to **Settings** › **Grade** › **Type**, choose **None**, and click **Save and return to course**.

### A cell marked (*) is "overridden"

If you typed a grade into the gradebook yourself, Moodle marks the cell as overridden. Moodle then **ignores every grade ENARA sends to that cell**. In ENARA, the grade shows as "Changed in LMS".

To let ENARA's grades through again:

1. Go to **Grades**, and in the drop-down menu choose **Single view**.
2. Choose the ENARA grade item.
3. On the student's row, untick **Override**.
4. Click **Save**.

The next grade ENARA sends will fill the cell.
