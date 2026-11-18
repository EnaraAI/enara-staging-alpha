# Connecting your school's Moodle to ENARA

**English** · [العربية](#ربط-moodle-في-مدرستك-بإنارة-enara)

This guide is for the **school admin** and the **Moodle site administrator** (they can be the same person). It takes about **15 minutes**. ENARA sends you a link made for your school; you paste it into Moodle, and ENARA checks the connection by itself.

You can follow every step on ENARA's **LMS connection status** page (sign in to ENARA as the school admin). It shows a tick and a time for each step, what to do next, and the time since the invite.

## The 5 steps (Moodle site administrator)

1. **Paste the link in Moodle.** In Moodle go to **Site administration › Plugins › Activity modules › External tool › Manage tools**. Paste the ENARA link in **Tool URL** and click **Add LTI Advantage**.
   - If Moodle says there are existing tools for this address, click **Register as a new external tool** (never **Update**).
   - Wait for the window that says **"ENARA is registered"**. It closes by itself.
   - The link works **once** and expires after **7 days**. If it expired, ask ENARA (or use **New link** on the status page).
2. **Click Activate.** On the new **ENARA** tool card (it says **Pending**), click **Activate**.
3. **Set the 4 settings by hand** (Moodle cannot take them from the link). On the ENARA card, click the **gear icon** (Edit), then:
   1. **Activate**: done in step 2. The card must no longer say **Pending**.
   2. **Accept grades = Always**: under **Privacy**, set **Accept grades from the tool** to **Always**. (Moodle sets "Delegate to teacher".)
   3. **Show in the activity chooser**: set **Tool configuration usage** to **Show in activity chooser and as a preconfigured tool**. (Moodle sets "Show as preconfigured tool when adding an external tool", so teachers would not see ENARA in **Add an activity or resource**.)
   4. **Restrict to category** (Moodle 4.3 or later): if this Moodle serves **more than one school**, set **Restrict to category** to your school's course category. With one school only, nothing to change.

   Click **Save changes**. Then, on ENARA's status page, **tick each of the 4 settings**. ENARA cannot see these settings in Moodle, so it records who ticked each one and when.
4. **Add ENARA to a course.** In a Moodle course, turn editing on, click **Add an activity or resource › ENARA**, click **Select content**, pick an item (for example **ENARA home (course link)**) and save.
5. **Open it once**, first as a **teacher**, then as a **student**. ENARA then shows "Activated", "First teacher" and "First student" on the status page, reads the course's class list, and sends grades after a student finishes graded work.

Already set by the link (no change needed): Default launch container = Embed, without blocks; Supports Deep Linking; IMS LTI Assignment and Grade Services = Use this service for grade sync and column management; IMS LTI Names and Role Provisioning = Use this service to retrieve members' information as per privacy settings; Share launcher's name = Always; Share launcher's email = Always.

## Never enrol parents in Moodle courses with ENARA activities

**Never enrol parents (or other guardians) in Moodle courses that contain ENARA activities.** ENARA would treat them as course members. Parents use the separate **ENARA Parents Portal**, which the school invites them to.

## The automatic connection check

ENARA checks the connection by itself right after Moodle registers it, when you click **Check again** on the status page, and every night for connections whose last check failed. Each step shows ✓ (OK), ✗ (problem) or "waiting", in English and Arabic, with what to do:

| Step | What ENARA checks | If it fails |
|---|---|---|
| Registered | the link was used and the connection was stored | "The link wasn't used yet", or "it expired: make a new one" |
| Moodle reachable | ENARA reads Moodle's public keys | see "Moodle inside the school network" below |
| Grade and roster access | Moodle gives ENARA a service sign-in for grades and class lists | before **Activate** this waits; after it: check the two services in the tool settings |
| Activated | a teacher or student opened ENARA from Moodle | click **Activate**, then open ENARA once |
| Roster | a course's class list was read | check **IMS LTI Names and Role Provisioning** |
| Grades | a grade was sent, or the course's grade columns can be read | check the grade service and **Accept grades = Always** |

## Moodle inside the school network (on-premise)

If the internet cannot reach your Moodle, ENARA shows: **"Your Moodle can't be reached from the internet."**

- **Students and teachers can still open ENARA**: opening an activity goes through their own browser.
- **Grades and class lists need ENARA to reach Moodle.** Your IT team must allow ENARA to reach your **Moodle address** (for example `moodle.school.eg`) over https from the internet.
- **ENARA has no fixed IP address.** Allow the Moodle address **by name**; do not ask ENARA for an IP address to allow.
- If the one-URL link cannot work at all (ENARA cannot read Moodle's settings address), ENARA can be connected **by hand**: in ENARA's **LMS connections › Or by hand**, enter Moodle's values and **paste Moodle's public key** instead of the keyset URL (the JSON that `…/mod/lti/certs.php` shows when opened inside the school network, or a PEM public key). ENARA then checks launches with that key without reaching Moodle. The status page also offers **paste Moodle's public key** for a connection ENARA cannot reach.

---

<div dir="rtl" lang="ar">

# ربط Moodle في مدرستك بإنارة (ENARA)

هذا الدليل موجّه إلى **مسؤول المدرسة** و**مسؤول موقع Moodle** (قد يكونان الشخص نفسه). يستغرق الربط نحو **15 دقيقة**. يرسل لك فريق ENARA رابطًا خاصًا بمدرستك، فتلصقه في Moodle، ثم يتحقق ENARA من الربط بنفسه.

يمكنك متابعة كل خطوة في صفحة **حالة ربط نظام إدارة التعلم** في ENARA (سجّل الدخول إلى ENARA بصفتك مسؤول المدرسة). تُظهر الصفحة علامة ووقتًا لكل خطوة، والخطوة التالية، والوقت المنقضي منذ الدعوة.

## الخطوات الخمس (مسؤول موقع Moodle)

1. **الصق الرابط في Moodle.** في Moodle اذهب إلى **Site administration › Plugins › Activity modules › External tool › Manage tools** (إدارة الموقع › الإضافات › وحدات الأنشطة › أداة خارجية › إدارة الأدوات). الصق رابط ENARA في **Tool URL** واضغط **Add LTI Advantage**.
   - إذا ذكر Moodle وجود أدوات حالية لهذا العنوان، فاضغط **Register as a new external tool** (ولا تضغط **Update** أبدًا).
   - انتظر النافذة التي تقول **"ENARA is registered"**، وستُغلق تلقائيًا.
   - يعمل الرابط **مرة واحدة** وتنتهي صلاحيته بعد **7 أيام**. إذا انتهت صلاحيته فاطلب رابطًا جديدًا من ENARA (أو استخدم **رابط جديد** في صفحة الحالة).
2. **اضغط Activate.** على بطاقة أداة **ENARA** الجديدة (تظهر عليها **Pending**) اضغط **Activate** (تفعيل).
3. **اضبط الإعدادات الأربعة يدويًا** (لا يستطيع Moodle أخذها من الرابط). على بطاقة ENARA اضغط **رمز الترس** (Edit)، ثم:
   1. **التفعيل (Activate)**: تم في الخطوة 2. يجب ألا تُظهر البطاقة **Pending** بعد ذلك.
   2. **قبول الدرجات = Always (دائمًا)**: من قسم **Privacy** اجعل **Accept grades from the tool** على **Always**. (يضبطه Moodle على "Delegate to teacher".)
   3. **الظهور في قائمة اختيار الأنشطة**: اجعل **Tool configuration usage** على **Show in activity chooser and as a preconfigured tool**. (يضبطه Moodle على "Show as preconfigured tool when adding an external tool"، فلا يرى المعلمون ENARA في **Add an activity or resource**.)
   4. **التقييد بفئة المقررات (Restrict to category)** (من Moodle 4.3): إذا كان Moodle هذا يخدم **أكثر من مدرسة**، فاجعل **Restrict to category** على فئة مقررات مدرستك. إذا كانت مدرسة واحدة فقط فلا حاجة لأي تغيير.

   اضغط **Save changes** (حفظ التغييرات). ثم **ضع علامة على كل إعداد من الإعدادات الأربعة** في صفحة الحالة في ENARA. لا يستطيع ENARA رؤية هذه الإعدادات في Moodle، لذلك يسجّل من وضع كل علامة ومتى.
4. **أضف ENARA إلى مقرر.** في مقرر Moodle شغّل وضع التحرير، واضغط **Add an activity or resource › ENARA**، ثم **Select content**، واختر عنصرًا (مثلًا **ENARA home (course link)**) واحفظ.
5. **افتحه مرة واحدة**، أولًا بصفة **معلم** ثم بصفة **طالب**. تُظهر صفحة الحالة بعد ذلك "التفعيل" و"أول معلم" و"أول طالب"، ويقرأ ENARA قائمة طلاب المقرر، ويرسل الدرجات بعد أن يُنهي الطالب عملًا مُقيّمًا.

إعدادات يضبطها الرابط (لا حاجة لتغييرها): Default launch container = Embed, without blocks؛ Supports Deep Linking؛ IMS LTI Assignment and Grade Services = Use this service for grade sync and column management؛ IMS LTI Names and Role Provisioning = Use this service to retrieve members' information as per privacy settings؛ Share launcher's name = Always؛ Share launcher's email = Always.

## لا تسجّل أولياء الأمور أبدًا في مقررات Moodle التي تحتوي على أنشطة ENARA

**لا تسجّل أولياء الأمور (أو الأوصياء) أبدًا في مقررات Moodle التي تحتوي على أنشطة ENARA.** سيعاملهم ENARA كأعضاء في المقرر. يستخدم أولياء الأمور **بوابة أولياء الأمور في ENARA** المنفصلة، وتدعوهم المدرسة إليها.

## التحقق التلقائي من الربط

يتحقق ENARA من الربط بنفسه مباشرة بعد أن يسجّله Moodle، وعندما تضغط **تحقق مرة أخرى** في صفحة الحالة، وكل ليلة للاتصالات التي فشل آخر تحقق منها. تُظهر كل خطوة ✓ (سليم) أو ✗ (مشكلة) أو "بانتظار"، بالعربية والإنجليزية، مع ما يجب فعله:

| الخطوة | ما يتحقق منه ENARA | إذا فشلت |
|---|---|---|
| التسجيل | استُخدم الرابط وحُفظ الاتصال | "لم يُستخدم الرابط بعد"، أو "انتهت صلاحيته: أنشئ رابطًا جديدًا" |
| الوصول إلى Moodle | يقرأ ENARA المفاتيح العامة لـ Moodle | انظر "Moodle داخل شبكة المدرسة" أدناه |
| الوصول إلى الدرجات وقوائم الطلاب | يمنح Moodle إنارة دخول الخدمة للدرجات وقوائم الطلاب | قبل **Activate** تبقى "بانتظار"؛ بعده: تحقق من الخدمتين في إعدادات الأداة |
| التفعيل | فتح معلم أو طالب ENARA من Moodle | اضغط **Activate** ثم افتح ENARA مرة واحدة |
| قائمة الطلاب | قُرئت قائمة طلاب مقرر | تحقق من **IMS LTI Names and Role Provisioning** |
| الدرجات | أُرسلت درجة، أو يمكن قراءة أعمدة درجات المقرر | تحقق من خدمة الدرجات ومن **Accept grades = Always** |

## Moodle داخل شبكة المدرسة

إذا كان Moodle غير متاح من الإنترنت، يُظهر ENARA: **"لا يمكن الوصول إلى Moodle الخاص بكم من الإنترنت."**

- **ما زال الطلاب والمعلمون يستطيعون فتح ENARA**: فتح النشاط يمر عبر متصفحهم.
- **الدرجات وقوائم الطلاب تحتاج إلى وصول ENARA إلى Moodle.** يجب أن يسمح فريق تقنية المعلومات لـ ENARA بالوصول إلى **عنوان Moodle** (مثلًا <span dir="ltr">`moodle.school.eg`</span>) عبر https من الإنترنت.
- **ليس لـ ENARA عنوان IP ثابت.** اسمحوا بعنوان Moodle **بالاسم**، ولا تطلبوا من ENARA عنوان IP للسماح به.
- إذا لم يعمل الرابط الواحد إطلاقًا (لم يستطع ENARA قراءة عنوان إعدادات Moodle)، يمكن ربط ENARA **يدويًا**: في **اتصالات نظام إدارة التعلم › أو يدويًا** أدخل قيم Moodle و**الصق المفتاح العام لـ Moodle** بدل رابط المفاتيح (JSON الذي يُظهره <span dir="ltr">`…/mod/lti/certs.php`</span> عند فتحه داخل شبكة المدرسة، أو مفتاح عام بصيغة PEM). يتحقق ENARA بعد ذلك من الفتح بهذا المفتاح دون الوصول إلى Moodle. وتعرض صفحة الحالة أيضًا خيار **لصق المفتاح العام لـ Moodle** للاتصال الذي لا يستطيع ENARA الوصول إليه.

</div>
