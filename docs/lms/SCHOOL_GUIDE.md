# Connecting your school's Moodle to ENARA

**English** · [العربية](#ربط-moodle-في-مدرستك-بإنارة-enara)

This guide is for the **school admin** and the **Moodle site administrator** (they can be the same person). Connecting takes about **15 minutes**. You paste one link into Moodle, set 3 settings by hand, and ENARA checks the rest by itself. Menu names are as Moodle 4.5 shows them in English.

> **Status today: ENARA's test site only.** Everything below is built and running on ENARA's test site (lms-test) with test schools and made-up data. On the test site:
> - **Grades** go to Moodle. For real schools, ENARA keeps grades **off** until its automatic grader passes ENARA's accuracy bar; then ENARA switches them on. Until then the status page shows "Sending grades is switched off on ENARA". You have nothing to do.
> - **Emails** go only to ENARA's own test inbox, never to you or your teachers.
> - The **AI tutor** and the **live avatar** are not set up yet, so students see a "not set up" message instead of a session.
> - The **nightly jobs** (class list sync, the connection re-check, the daily emails) run only when ENARA starts them by hand. A teacher opening ENARA still syncs the class list.

## Before you start

- A Moodle **site administrator** account. Moodle **4.3 or later** (ENARA is tested on Moodle 4.5 and the latest Moodle).
- Your ENARA **school admin** account. In ENARA, the **LMS connection status** page (left menu) shows each step with a tick and a time, the next step, and the time since the invite.

## Step 0: get your Moodle link

- ENARA sends you a link made for your school. It works **once** and expires after **7 days**.
- If ENARA's email reached you instead: the email **never contains the Moodle link**. Sign in to ENARA with its button, open **LMS connection status**, click **New link**, and copy the link it shows. A new link cancels the old unused one.
- A link made by ENARA, or with **New link** before your school is connected, connects at once. A link you make yourself in **LMS connections › Connect Moodle (one URL)** waits for ENARA's approval first.

## The 5 steps (Moodle site administrator)

1. **Paste the link in Moodle.** Go to **Site administration › Plugins › Activity modules › External tool › Manage tools**. Paste the ENARA link in **Tool URL** and click **Add LTI Advantage**.
   - If Moodle says there are existing tools for this address, click **Register as a new external tool**. Never click **Update**: ENARA refuses it, and nothing changes.
   - Wait for **"ENARA is registered. Click Activate in Moodle."** The window closes by itself.
   - If it shows **"ENARA could not be connected"**, note the **Reference** code. In most cases the same link still works: try again. If it fails again, send the code to ENARA.
2. **Click Activate.** On the new **ENARA** tool card (it says **Pending**), click **Activate**.
3. **Set the 3 settings Moodle cannot take from the link.** On the ENARA card, click the **gear icon** (Edit):
   1. **Accept grades from the tool = Always** (under **Privacy**). Moodle sets "Delegate to teacher".
      With **Always**, Moodle makes a grade column (out of 100) for **every** ENARA activity. Activities that have no grade (the ENARA course link, links to ENARA pages, AI tutor, live avatar and diagnostic activities) still get a column, and it **stays empty**: ENARA never sends a grade to it. Teachers can remove it (activity **Settings › Grade › Type: None**). Quizzes, tests and practice fill their columns.
   2. **Tool configuration usage = Show in activity chooser and as a preconfigured tool.** Moodle sets "Show as preconfigured tool when adding an external tool", so teachers would not see ENARA in **Add an activity or resource**.
   3. **Restrict to category**: only if this Moodle serves **more than one school**. Choose your school's course category. With one school, leave it.

   Click **Save changes**. Then, on ENARA's **LMS connection status** page, **tick all 4 items** under "Moodle settings to set by hand": **Activate**, **Accept grades from the tool = Always**, **Show in activity chooser**, **Restrict to category** (tick it also when you have one school). ENARA cannot see these settings in Moodle, so it records who ticked each one and when.
4. **Add ENARA to a course.** In a Moodle course, turn editing on, click **Add an activity or resource › ENARA**, click **Select content**, pick an item (for example **ENARA home (course link)**) and save.
5. **Open it once**, first as a **teacher**, then as a **student**. The status page then ticks "Activated in Moodle", "First teacher opened ENARA" and "First student opened ENARA". After that it ticks "Class list synced", and "First grade sent to Moodle" once a student finishes graded work.

Already set by the link (no change needed): Default launch container = Embed, without blocks; Supports Deep Linking; IMS LTI Assignment and Grade Services = Use this service for grade sync and column management; IMS LTI Names and Role Provisioning = Use this service to retrieve members' information as per privacy settings; Share launcher's name with the tool = Always; Share launcher's email with the tool = Always.

## Never enrol parents in Moodle courses that contain ENARA activities

**Never enrol parents (or other guardians) in Moodle courses that contain ENARA activities.** ENARA would treat them as students: a student account, a seat, and a place on the class list. Parents use ENARA itself: in ENARA the school admin gives each parent a one-time **invite code** from the student's profile (**Parent access**), and the parent types it on ENARA's **Parents** sign-in. Codes are never put in a link.

## What happens once you are connected

- **Accounts.** ENARA makes an account for each teacher and student when they first open ENARA from Moodle or when it reads the class list, and one ENARA class per Moodle course. Nobody needs an ENARA password. People are matched by their Moodle account, never by email.
- **Class lists.** ENARA reads each course's class list when a teacher opens ENARA (if the last read is older than 24 hours), every night, and when a teacher clicks **Sync roster now**. A student who has not opened ENARA yet shows as **Not started** and takes **no seat**. A student removed from the Moodle course leaves the ENARA class; their work and grades are kept.
- **Grades.** Quizzes and tests send the student's **latest** released result. Practice sends the student's **best** attempt. Grades reach Moodle within seconds of the result. If a teacher changes a grade in the Moodle gradebook, ENARA marks it **Changed in LMS** and does not overwrite it until a teacher decides in ENARA.
- **Due dates.** Teachers can give a quiz, test or assignment a due date in the picker. ENARA uses your school's time zone: **Cairo time (Africa/Cairo)** unless ENARA set another for your school.
- **Microphone.** Speaking activities, the AI tutor (voice) and the live avatar need the microphone. If the browser blocks it inside Moodle, ENARA shows **Open in a new tab**: the same activity opens in a new tab, still signed in, with the work kept. Nothing to set in Moodle.
- **Seats.** Above your seat limit, students can still open ENARA; you get an email and ENARA follows up on billing.

## Emails

Emails go in your school's language: **Arabic by default for schools in Egypt**, otherwise English (ENARA can change it). **No email contains a student's name or score, and no email link contains a code, a key or the Moodle link**: every button opens ENARA, where you sign in. Students and parents get no emails from this connection.

**School admins** get:
- the invitation to connect, and a reminder when the Moodle link is about to expire or has expired unused;
- connection news: connected, waiting for ENARA's approval, not approved, switched off, the automatic check failed, repeated key or sign-in errors with Moodle;
- a daily note only when something failed: grades that could not be sent, class lists that could not be read;
- seats: 80 % and 90 % of the limit, and over the limit;
- on Mondays, a short usage summary.

**Teachers** get emails only if they say yes. The first time a teacher opens ENARA from Moodle, ENARA asks **"Email me Enara updates?"** with the email Moodle shared already filled in. **Yes, email me**: a welcome email, then notes when grades were changed in Moodle, when a newer attempt waits for review, when an activity may have been deleted in Moodle, and on Mondays how many students have not started. **No thanks**, or no answer: no teacher emails.

## The automatic connection check

ENARA checks the connection right after Moodle registers it, when you click **Check again** on the status page, and every night while the last check failed. Each step shows OK, Problem or Waiting, in English and Arabic, with a **Reference** code and what to do:

| Step | What ENARA checks | If it fails |
|---|---|---|
| Registered | the link was used and the connection was stored | "The link wasn't used yet", or "it expired: make a new one". "Waits for approval by ENARA": nothing to do in Moodle |
| Moodle reachable | ENARA reads Moodle's public keys | see "Moodle inside the school network" below |
| Grade and roster access | Moodle lets ENARA in for grades and class lists | before **Activate** this waits; after it, check the two services in the tool settings |
| Activated | a teacher or student opened ENARA from Moodle | click **Activate**, add ENARA to a course, open it once |
| Roster | a course's class list was read | check **IMS LTI Names and Role Provisioning** |
| Grades | a grade was sent, or the course's grade columns can be read | check the grade service and **Accept grades from the tool = Always**. "Switched off on ENARA": nothing to do (see Status today) |

## Moodle inside the school network (on-premise)

If the internet cannot reach your Moodle, ENARA shows: **"Your Moodle can't be reached from the internet."**

- **Students and teachers can still open ENARA**: opening an activity goes through their own browser.
- **Grades and class lists need ENARA to reach Moodle.** Your IT team must allow ENARA to reach your **Moodle address** (for example `moodle.school.eg`) over https from the internet.
- **ENARA has no fixed IP address.** Allow the Moodle address **by name**. Do not ask ENARA for an IP address.
- Your Moodle server must also be able to reach ENARA's address over https, to check ENARA's signed answers (for example from the activity picker).
- **Paste Moodle's public key.** Then ENARA checks launches with that key and never needs to reach Moodle's key address. Get the key by opening `https://<your Moodle>/mod/lti/certs.php` inside the school network and copying all of it (or use a PEM public key).
  - If the link worked: on the status page, paste it in **"Moodle can't be reached from the internet: paste Moodle's public key"** and click **Save public key**.
  - If the link could not finish ("ENARA could not read Moodle's settings address"), connect **by hand**. In ENARA, **LMS connections › Or by hand** shows ENARA's values to enter in Moodle (**Manage tools › configure a tool manually**, LTI 1.3, public key type **Keyset URL**). Then, in **2. Add your LMS here**, enter Moodle's values, leave **Public keyset URL** empty and paste the key in **Public key**. A connection made by hand waits for ENARA's approval. In Moodle, set by hand the settings the link would have set (the "Already set by the link" list above, plus **Supports Deep Linking** with **Content Selection URL** = ENARA's Tool URL), as well as the 3 settings in step 3.

---

<div dir="rtl" lang="ar">

# ربط Moodle في مدرستك بإنارة (ENARA)

هذا الدليل موجّه إلى **مسؤول المدرسة** و**مسؤول موقع Moodle** (وقد يكونان الشخص نفسه). يستغرق الربط نحو **15 دقيقة**: تلصق رابطًا واحدًا في Moodle، وتضبط 3 إعدادات يدويًا، ويتحقق ENARA من الباقي بنفسه. أسماء القوائم مكتوبة كما يعرضها Moodle 4.5 باللغة الإنجليزية.

> **الوضع الحالي: موقع ENARA التجريبي فقط.** كل ما يلي مُنجز ويعمل على موقع ENARA التجريبي (lms-test) مع مدارس تجريبية وبيانات غير حقيقية. على الموقع التجريبي:
> - تُرسَل **الدرجات** إلى Moodle. أما في المدارس الفعلية فيُبقي ENARA إرسال الدرجات **متوقفًا** حتى يجتاز التصحيح الآلي معيار الدقة الذي حدده ENARA، ثم يشغّله ENARA. وحتى ذلك الحين تُظهر صفحة الحالة "إرسال الدرجات متوقف في ENARA"، ولا يُطلب منك أي إجراء.
> - تذهب **رسائل البريد** إلى صندوق ENARA التجريبي فقط، ولا تصل إليك ولا إلى معلميك.
> - **المعلم الذكي** و**المعلم المرئي** غير مُعدَّين بعد، فيرى الطلاب رسالة "غير مُعدّ" بدل الجلسة.
> - لا تعمل **المهام الليلية** (مزامنة قوائم الطلاب، وإعادة التحقق من الربط، والرسائل اليومية) إلا عندما يشغّلها ENARA يدويًا. ومع ذلك، تتم مزامنة قائمة الطلاب عندما يفتح المعلم ENARA.

## قبل أن تبدأ

- حساب **مسؤول موقع** في Moodle، وإصدار Moodle **4.3 أو أحدث** (جُرّب ENARA على Moodle 4.5 وأحدث إصدار من Moodle).
- حساب **مسؤول المدرسة** في ENARA. تعرض صفحة **LMS connection status** (حالة ربط نظام إدارة التعلم) في القائمة الجانبية كل خطوة بعلامة ووقت، والخطوة التالية، والوقت المنقضي منذ الدعوة.

## الخطوة 0: احصل على رابط Moodle

- يرسل لك ENARA رابطًا خاصًا بمدرستك. يعمل **مرة واحدة** وتنتهي صلاحيته بعد **7 أيام**.
- إذا وصلتك رسالة بريد من ENARA بدلًا من ذلك، فاعلم أن الرسالة **لا تحتوي أبدًا على رابط Moodle**. سجّل الدخول إلى ENARA بالزر الموجود فيها، وافتح **LMS connection status**، واضغط **رابط جديد** (New link)، وانسخ الرابط الذي يظهر. الرابط الجديد يُلغي الرابط القديم غير المستخدم.
- الرابط الذي ينشئه ENARA، أو الذي تنشئه بزر **رابط جديد** قبل ربط مدرستك، يُفعّل الاتصال فورًا. أما الرابط الذي تنشئه بنفسك من **LMS connections › Connect Moodle (one URL)** فينتظر موافقة ENARA أولًا.

## الخطوات الخمس (مسؤول موقع Moodle)

1. **الصق الرابط في Moodle.** اذهب إلى **Site administration › Plugins › Activity modules › External tool › Manage tools** (إدارة الموقع › الإضافات › وحدات الأنشطة › أداة خارجية › إدارة الأدوات). الصق رابط ENARA في **Tool URL** واضغط **Add LTI Advantage**.
   - إذا ذكر Moodle وجود أدوات حالية لهذا العنوان، فاضغط **Register as a new external tool**. لا تضغط **Update** أبدًا: سيرفضه ENARA ولن يتغير شيء.
   - انتظر ظهور **"ENARA is registered. Click Activate in Moodle."** (تم تسجيل ENARA، اضغط Activate في Moodle). ستُغلق النافذة تلقائيًا.
   - إذا ظهرت **"ENARA could not be connected"** (تعذّر ربط ENARA)، فدوّن **رمز المرجع** (Reference). في أغلب الحالات يظل الرابط نفسه صالحًا: حاول مرة أخرى. وإذا فشل ثانيةً فأرسل الرمز إلى ENARA.
2. **اضغط Activate.** على بطاقة أداة **ENARA** الجديدة (تظهر عليها **Pending**) اضغط **Activate** (تفعيل).
3. **اضبط الإعدادات الثلاثة التي لا يأخذها Moodle من الرابط.** على بطاقة ENARA اضغط **رمز الترس** (Edit):
   1. **Accept grades from the tool = Always** (قبول الدرجات من الأداة = دائمًا)، من قسم **Privacy**. يضبطه Moodle على "Delegate to teacher".
      مع **Always** يُنشئ Moodle عمود درجات (من 100) لـ**كل** نشاط من أنشطة ENARA. والأنشطة التي لا درجة لها (رابط المقرر، وروابط صفحات ENARA، وأنشطة المعلم الذكي والمعلم المرئي والاختبار التشخيصي) يُنشأ لها عمود أيضًا، لكنه **يبقى فارغًا** لأن ENARA لا يرسل إليه أي درجة. يستطيع المعلمون حذفه من إعدادات النشاط (**Settings › Grade › Type: None**). أما الاختبارات القصيرة والاختبارات والتدريبات فتملأ أعمدتها.
   2. **Tool configuration usage = Show in activity chooser and as a preconfigured tool** (الظهور في قائمة اختيار الأنشطة). يضبطه Moodle على "Show as preconfigured tool when adding an external tool"، وحينها لا يرى المعلمون ENARA في **Add an activity or resource**.
   3. **Restrict to category** (التقييد بفئة المقررات): فقط إذا كان Moodle هذا يخدم **أكثر من مدرسة**. اختر فئة مقررات مدرستك. وإذا كانت مدرسة واحدة فاتركه كما هو.

   اضغط **Save changes** (حفظ التغييرات). ثم **ضع علامة على البنود الأربعة كلها** في صفحة **LMS connection status** في ENARA، تحت "إعدادات Moodle التي تُضبط يدويًا": **التفعيل (Activate)**، و**قبول الدرجات من الأداة = Always (دائمًا)**، و**الظهور في قائمة اختيار الأنشطة**، و**التقييد بفئة المقررات (Restrict to category)** (ضع عليه العلامة حتى لو كانت مدرسة واحدة). لا يستطيع ENARA رؤية هذه الإعدادات في Moodle، لذلك يسجّل من وضع كل علامة ومتى.
4. **أضف ENARA إلى مقرر.** في مقرر Moodle شغّل وضع التحرير، واضغط **Add an activity or resource › ENARA**، ثم **Select content**، واختر عنصرًا (مثلًا **ENARA home (course link)**، أي رابط المقرر) ثم احفظ.
5. **افتحه مرة واحدة**، أولًا بصفة **معلم** ثم بصفة **طالب**. تضع صفحة الحالة بعدها علامة على "فُعّلت الأداة في Moodle" و"أول معلم فتح ENARA" و"أول طالب فتح ENARA"، ثم على "تمت مزامنة قائمة الطلاب"، وعلى "أُرسلت أول درجة إلى Moodle" بعد أن يُنهي طالب عملًا مُقيّمًا.

إعدادات يضبطها الرابط (لا حاجة لتغييرها): <span dir="ltr">Default launch container = Embed, without blocks</span>؛ <span dir="ltr">Supports Deep Linking</span>؛ <span dir="ltr">IMS LTI Assignment and Grade Services = Use this service for grade sync and column management</span>؛ <span dir="ltr">IMS LTI Names and Role Provisioning = Use this service to retrieve members' information as per privacy settings</span>؛ <span dir="ltr">Share launcher's name with the tool = Always</span>؛ <span dir="ltr">Share launcher's email with the tool = Always</span>.

## لا تسجّل أولياء الأمور أبدًا في مقررات Moodle التي تحتوي على أنشطة ENARA

**لا تسجّل أولياء الأمور (أو الأوصياء) أبدًا في مقررات Moodle التي تحتوي على أنشطة ENARA.** سيعاملهم ENARA كطلاب: حساب طالب، ومقعد من مقاعد المدرسة، ومكان في قائمة الفصل. يستخدم أولياء الأمور ENARA نفسه: يعطي مسؤول المدرسة كل ولي أمر **رمز دعوة** يُستخدم مرة واحدة من ملف الطالب في ENARA (**Parent access**)، ويكتبه ولي الأمر عند تسجيل الدخول من تبويب **أولياء الأمور** في ENARA. لا يوضع الرمز في أي رابط.

## ماذا يحدث بعد الربط

- **الحسابات.** يُنشئ ENARA حسابًا لكل معلم وطالب عند أول فتح لـ ENARA من Moodle أو عند قراءة قائمة الطلاب، وفصلًا واحدًا في ENARA لكل مقرر في Moodle. لا يحتاج أحد إلى كلمة مرور لـ ENARA. ويُطابَق كل شخص بحسابه في Moodle، لا ببريده الإلكتروني أبدًا.
- **قوائم الطلاب.** يقرأ ENARA قائمة طلاب كل مقرر عندما يفتح المعلم ENARA (إذا مرّ أكثر من 24 ساعة على آخر قراءة)، وكل ليلة، وعندما يضغط المعلم **Sync roster now** (مزامنة القائمة الآن). الطالب الذي لم يفتح ENARA بعد يظهر بحالة **Not started** (لم يبدأ) و**لا يشغل مقعدًا**. والطالب الذي يُحذف من مقرر Moodle يخرج من فصل ENARA، مع الاحتفاظ بأعماله ودرجاته.
- **الدرجات.** ترسل الاختبارات القصيرة والاختبارات **آخر** نتيجة معتمدة للطالب، وترسل التدريبات **أفضل** محاولة له. تصل الدرجات إلى Moodle خلال ثوانٍ من ظهور النتيجة. وإذا غيّر معلم درجةً في سجل درجات Moodle، يضع ENARA عليها علامة **Changed in LMS** (تغيّرت في نظام إدارة التعلم) ولا يكتب فوقها حتى يقرر معلم ذلك في ENARA.
- **مواعيد التسليم.** يستطيع المعلمون تحديد موعد تسليم لاختبار قصير أو اختبار أو واجب من أداة اختيار المحتوى. يستخدم ENARA المنطقة الزمنية لمدرستك: **توقيت القاهرة (Africa/Cairo)** ما لم يحدد ENARA منطقة أخرى لمدرستك.
- **الميكروفون.** تحتاج أنشطة التحدث والمعلم الذكي (بالصوت) والمعلم المرئي إلى الميكروفون. إذا منعه المتصفح داخل Moodle، يعرض ENARA زر **Open in a new tab** (افتح في علامة تبويب جديدة): يُفتح النشاط نفسه في علامة تبويب جديدة، ويبقى الطالب مسجّلًا للدخول ويُحفظ عمله. لا حاجة لأي إعداد في Moodle.
- **المقاعد.** إذا تجاوزت المدرسة حد المقاعد يظل الطلاب قادرين على فتح ENARA، وتصلك رسالة بريد، ويتابع ENARA مسألة الفوترة.

## رسائل البريد

تصل الرسائل بلغة مدرستك: **العربية افتراضيًا لمدارس مصر**، والإنجليزية لغيرها (ويستطيع ENARA تغييرها). **لا تحتوي أي رسالة على اسم طالب أو درجته، ولا يحتوي أي رابط في الرسائل على رمز أو مفتاح أو على رابط Moodle**: كل زر يفتح ENARA حيث تسجّل الدخول. ولا يتلقى الطلاب ولا أولياء الأمور أي رسائل من هذا الربط.

يتلقى **مسؤولو المدرسة**:
- دعوة الربط، وتذكيرًا عندما يقترب انتهاء صلاحية رابط Moodle أو تنتهي دون استخدامه؛
- أخبار الاتصال: تم الربط، أو بانتظار موافقة ENARA، أو لم تتم الموافقة، أو أُوقف، أو فشل التحقق التلقائي، أو تكررت أخطاء المفاتيح أو تسجيل الدخول مع Moodle؛
- رسالة يومية عند حدوث فشل فقط: درجات تعذّر إرسالها، أو قوائم طلاب تعذّرت قراءتها؛
- المقاعد: عند بلوغ 80% و90% من الحد، وعند تجاوزه؛
- ملخصًا قصيرًا للاستخدام كل يوم اثنين.

أما **المعلمون** فلا يتلقون رسائل إلا إذا وافقوا. في أول مرة يفتح فيها المعلم ENARA من Moodle، يسأله ENARA **"Email me Enara updates?"** (هل ترغب في تلقي رسائل من إنارة عن مقرراتك؟)، مع البريد الذي شاركه Moodle مكتوبًا مسبقًا. إذا اختار **Yes, email me** (نعم) تصله رسالة ترحيب، ثم تنبيهات عندما تتغير درجات في Moodle، وعندما تنتظر محاولة أحدث المراجعة، وعندما يبدو أن نشاطًا حُذف من Moodle، وكل يوم اثنين عدد الطلاب الذين لم يبدؤوا بعد. وإذا اختار **No thanks** (لا، شكرًا) أو لم يُجب، فلا تصله أي رسائل.

## التحقق التلقائي من الربط

يتحقق ENARA من الربط مباشرة بعد أن يسجّله Moodle، وعندما تضغط **تحقق مرة أخرى** في صفحة الحالة، وكل ليلة ما دام آخر تحقق قد فشل. تُظهر كل خطوة "سليم" أو "مشكلة" أو "بانتظار"، بالعربية والإنجليزية، مع **رمز المرجع** وما يجب فعله:

| الخطوة | ما يتحقق منه ENARA | إذا فشلت |
|---|---|---|
| التسجيل | استُخدم الرابط وحُفظ الاتصال | "لم يُستخدم الرابط بعد"، أو "انتهت صلاحيته: أنشئ رابطًا جديدًا". "ينتظر موافقة ENARA": لا حاجة لأي إجراء في Moodle |
| الوصول إلى Moodle | يقرأ ENARA المفاتيح العامة لـ Moodle | انظر "Moodle داخل شبكة المدرسة" أدناه |
| الوصول إلى الدرجات وقوائم الطلاب | يسمح Moodle لـ ENARA بالوصول إلى الدرجات وقوائم الطلاب | قبل **Activate** تبقى "بانتظار"؛ وبعده تحقق من الخدمتين في إعدادات الأداة |
| التفعيل | فتح معلم أو طالب ENARA من Moodle | اضغط **Activate**، وأضف ENARA إلى مقرر، وافتحه مرة واحدة |
| قائمة الطلاب | قُرئت قائمة طلاب مقرر | تحقق من <span dir="ltr">**IMS LTI Names and Role Provisioning**</span> |
| الدرجات | أُرسلت درجة، أو يمكن قراءة أعمدة درجات المقرر | تحقق من خدمة الدرجات ومن <span dir="ltr">**Accept grades from the tool = Always**</span>. "متوقف في ENARA": لا حاجة لأي إجراء (انظر الوضع الحالي) |

## Moodle داخل شبكة المدرسة

إذا كان Moodle غير متاح من الإنترنت، يُظهر ENARA: **"لا يمكن الوصول إلى Moodle الخاص بكم من الإنترنت."**

- **ما زال الطلاب والمعلمون يستطيعون فتح ENARA**، لأن فتح النشاط يمر عبر متصفحهم.
- **الدرجات وقوائم الطلاب تحتاج إلى وصول ENARA إلى Moodle.** يجب أن يسمح فريق تقنية المعلومات لـ ENARA بالوصول إلى **عنوان Moodle** (مثلًا <span dir="ltr">`moodle.school.eg`</span>) عبر https من الإنترنت.
- **ليس لـ ENARA عنوان IP ثابت.** اسمحوا بعنوان Moodle **بالاسم**، ولا تطلبوا من ENARA عنوان IP.
- يجب أيضًا أن يستطيع خادم Moodle الوصول إلى عنوان ENARA عبر https، ليتحقق من الردود الموقّعة التي يرسلها ENARA (مثل ردود أداة اختيار المحتوى).
- **الصق المفتاح العام لـ Moodle.** عندها يتحقق ENARA من فتح الأنشطة بهذا المفتاح ولا يحتاج إلى الوصول إلى عنوان مفاتيح Moodle. للحصول على المفتاح افتح <span dir="ltr">`https://<your Moodle>/mod/lti/certs.php`</span> من داخل شبكة المدرسة وانسخ محتواه كله (أو استخدم مفتاحًا عامًا بصيغة PEM).
  - إذا نجح الرابط: الصق المفتاح في صفحة الحالة في خانة **"لا يمكن الوصول إلى Moodle من الإنترنت: الصق المفتاح العام لـ Moodle"** واضغط **حفظ المفتاح العام**.
  - إذا لم يكتمل الرابط ("لم يستطع ENARA قراءة عنوان إعدادات Moodle")، فاربط **يدويًا**. في ENARA تعرض صفحة **LMS connections › Or by hand** القيم التي تُدخلها في Moodle (**Manage tools › configure a tool manually**، الإصدار LTI 1.3، ونوع المفتاح العام **Keyset URL**). ثم أدخل قيم Moodle في **2. Add your LMS here**، واترك **Public keyset URL** فارغًا، والصق المفتاح في **Public key**. الاتصال اليدوي ينتظر موافقة ENARA. وفي Moodle اضبط يدويًا الإعدادات التي كان الرابط سيضبطها (قائمة "إعدادات يضبطها الرابط" أعلاه، و**Supports Deep Linking** مع جعل **Content Selection URL** هو Tool URL الخاص بـ ENARA)، إضافة إلى الإعدادات الثلاثة في الخطوة 3.

</div>

---

## What changed in this version (for the owner)

- Added a **Status today** box: everything runs on lms-test only; grades to real schools stay off until the grader passes the accuracy bar; emails go only to ENARA's test inbox; tutor and avatar are not set up on lms-test; nightly jobs run only when started by hand (the lms-test daily workflow is not on `main`, so GitHub does not schedule it).
- Added **Step 0: get your Moodle link**: ENARA's email never carries the link; the school admin signs in and uses **New link**; which links connect at once and which wait for ENARA's approval.
- Step 3 is now **3 Moodle settings** (Activate is step 2), with a plain explanation of the empty grade columns under **Accept grades = Always**.
- **Restrict to category** must be ticked on the status page even with one school (the page says so; the old guide said "nothing to change").
- Step 5 now names the status page's real checklist items (including "Class list synced" and "First grade sent to Moodle").
- Parents: they would be treated as **students** (account, seat, class list); parent access is by invite code in ENARA, never in a link.
- New sections: **What happens once you are connected** (accounts, class lists, latest vs best, Changed in LMS, due dates in Cairo time, microphone and Open in a new tab, seats) and **Emails** (who gets what, Arabic default for Egypt, teacher opt-in, no names, scores or codes).
- Check table: "waits for approval by ENARA" and "switched off on ENARA" results added.
- On-premise: the Moodle server must also reach ENARA; where to paste the key on the status page; the full by-hand path (leave the keyset URL empty, the settings to set by hand, approval).
