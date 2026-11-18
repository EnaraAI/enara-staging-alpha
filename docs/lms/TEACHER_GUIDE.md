# ENARA in Moodle: guide for teachers and schools

This guide is for teachers and school admins who add ENARA activities to a Moodle course. The menu names are for Moodle 4.x.

## Recommended Moodle tool setting (school admin)

In **Site administration › Plugins › Activity modules › External tool › Manage tools › ENARA › edit › Privacy**, keep **Accept grades from the tool = Always** (owner decision, 18 Nov 2026). Moodle then creates a grade column for every ENARA activity. For links that have no grade, set the activity's **Grade › Type** to **None**; see "Activities that are really ungraded" below.

## School admin: connecting Moodle with one link

ENARA gives you (or your Moodle site administrator) a **Moodle link** from **LMS connections › Connect Moodle (one URL)**. The link is for your school, works once, and expires after 7 days.

1. In Moodle, go to **Site administration › Plugins › Activity modules › External tool › Manage tools**.
2. Paste the link in **Tool URL** and click **Add LTI Advantage**.
3. If Moodle says "There are existing tools attached to the registration's domain", click **Register as a new external tool**. Do not click **Update**: ENARA refuses it, and your other ENARA tool stays as it is.
4. The window shows **"ENARA is registered. Click Activate in Moodle."** and then closes.
5. Do the steps in "School admin: after connecting" below.

If the window shows "ENARA could not be connected", send the **Reference** code on it to ENARA. In most cases the same link still works: try again from step 1.

## School admin: after connecting

Moodle takes most settings from the link. These it **cannot** take, so set them by hand once:

1. **Activate the tool.** In **Site administration › Plugins › Activity modules › External tool › Manage tools**, find the new **ENARA** card (it says **Pending**) and click **Activate**.
2. **Open its settings.** On the ENARA card, click the **gear icon** (Edit).
3. **Show it in the activity chooser.** Under **Tool settings**, set **Tool configuration usage** to **Show in activity chooser and as a preconfigured tool**. (Moodle sets "Show as preconfigured tool when adding an external tool", so teachers would not see ENARA in **Add an activity or resource**.)
4. **Accept grades = Always.** Under **Privacy**, set **Accept grades from the tool** to **Always**. (Moodle sets "Delegate to teacher".)
5. Click **Save changes**.

Already set by the link (no change needed; you can check them on the same page): **Default launch container** = Embed, without blocks; **Supports Deep Linking (Content-Item Message)** ticked; **IMS LTI Assignment and Grade Services** = Use this service for grade sync and column management; **IMS LTI Names and Role Provisioning** = Use this service to retrieve members' information as per privacy settings; **Share launcher's name with the tool** = Always; **Share launcher's email with the tool** = Always.

If the connection was made with a school admin's link, ENARA approves it before teachers and students can open ENARA. Until then a launch shows "This LMS connection is waiting for approval by ENARA".

### One Moodle site for two schools

Each school connects with its own link, and Moodle shows one ENARA tool per school, for example **ENARA** and **ENARA (Test School B)**. Teachers must pick their own school's tool. On Moodle 4.3 or later, limit each tool to its school's courses: put each school's courses in its own course category, then in each ENARA tool's settings set **Restrict to category** to that school's category and click **Save changes**.

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
