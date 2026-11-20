<?php
// Test-only Moodle helper for the ENARA LMS end-to-end suite (Docker, fake data).
// Run inside the moodle container as www-data:
//   php /e2e/e2e_cli.php <command> [--key=value ...]
// Prints one JSON object on the last line of stdout.
//
// Commands:
//   provision                 users, categories, courses, enrolments (idempotent)
//   tools                     the LTI tool types (id, name, state, coursevisible, clientid)
//   tool-settings --name=N|--typeid=ID --category=C   the 4 settings Moodle cannot take from
//                             dynamic registration: Activate, show in activity
//                             chooser, Accept grades = Always, Restrict to category
//   tool-acceptgrades --typeid=N --value=0|1|2   Privacy › Accept grades from the tool:
//                             Never (0), Always (1), Delegate to teacher (2) (Phase 8 grade-column check)
//   enrol --user=U --course=SHORT [--role=student]
//   unenrol --user=U --course=SHORT
//   activities --course=SHORT the LTI activities of a course (id, cmid, name, typeid, intro)
//   grade --course=SHORT --activity=NAME|--cmid=ID --user=U   the gradebook value
//   set-grade --course=SHORT --activity=NAME --user=U --grade=G   a teacher's edit in the gradebook (overridden)
//   quiz-ws                   errors from Moodle quizzes: web services on (REST), a read-only service with the 3 quiz
//                             read functions and a token for it (throwaway Docker site; the token is fake test data)
//   quiz-setup --course=SHORT --name=N --user=U --answer=True|False   a 1-question true/false quiz (1 attempt, review allowed),
//                             and U's finished attempt with that answer (the right answer is True)
//   version                   Moodle release

define('CLI_SCRIPT', true);
$root = '/var/www/html';
require($root . '/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/lti/locallib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->dirroot . '/grade/lib.php');

$cmd = $argv[1] ?? '';
$opts = [];
foreach (array_slice($argv, 2) as $a) {
    if (preg_match('/^--([a-z0-9_-]+)=(.*)$/s', $a, $m)) {
        $opts[$m[1]] = $m[2];
    }
}
function opt(array $o, string $k, $default = null) {
    if (array_key_exists($k, $o)) return $o[$k];
    if ($default === null) {
        fwrite(STDERR, "missing --$k\n");
        exit(2);
    }
    return $default;
}
function out($v) {
    echo "\n" . json_encode($v) . "\n";
    exit(0);
}

\core\session\manager::set_user(get_admin());

const USERS = [
    ['username' => 'teacher.test', 'firstname' => 'Teacher', 'lastname' => 'Test'],
    ['username' => 'student.test', 'firstname' => 'Student', 'lastname' => 'Test'],
    ['username' => 'student2.test', 'firstname' => 'Student2', 'lastname' => 'Test'],
];
const COURSES = [
    ['shortname' => 'ENARATEST', 'fullname' => 'Enara Test Course', 'category' => 'School A'],
    ['shortname' => 'ENARAB', 'fullname' => 'Enara School B Course', 'category' => 'School B'],
    // Scenario 8: the school onboarded with "New school" (Test School C).
    ['shortname' => 'ENARAC', 'fullname' => 'Enara School C Course', 'category' => 'School C'],
];
// student2.test is enrolled by the roster scenario itself.
const ENROLMENTS = [
    ['ENARATEST', 'teacher.test', 'editingteacher'],
    ['ENARATEST', 'student.test', 'student'],
    ['ENARAB', 'teacher.test', 'editingteacher'],
    ['ENARAB', 'student.test', 'student'],
    ['ENARAC', 'teacher.test', 'editingteacher'],
    ['ENARAC', 'student.test', 'student'],
];

function course_by_short(string $short) {
    global $DB;
    return $DB->get_record('course', ['shortname' => $short], '*', MUST_EXIST);
}
function user_by_name(string $username) {
    global $DB, $CFG;
    return $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id, 'deleted' => 0], '*', MUST_EXIST);
}
function manual_instance($course) {
    global $DB;
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
    if (!$instance) {
        $plugin = enrol_get_plugin('manual');
        $id = $plugin->add_default_instance($course);
        $instance = $DB->get_record('enrol', ['id' => $id], '*', MUST_EXIST);
    }
    return $instance;
}
function do_enrol(string $username, string $short, string $role) {
    global $DB;
    $course = course_by_short($short);
    $user = user_by_name($username);
    $roleid = $DB->get_field('role', 'id', ['shortname' => $role], MUST_EXIST);
    enrol_get_plugin('manual')->enrol_user(manual_instance($course), $user->id, $roleid, 0, 0, ENROL_USER_ACTIVE);
    return ['course' => (int) $course->id, 'user' => (int) $user->id, 'role' => $role];
}
function lti_activity($course, string $name) {
    global $DB, $opts;
    if (!empty($opts['cmid'])) {
        $cm = get_coursemodule_from_id('lti', (int) $opts['cmid'], $course->id, false, MUST_EXIST);
        return $DB->get_record('lti', ['id' => $cm->instance], '*', MUST_EXIST);
    }
    $recs = $DB->get_records('lti', ['course' => $course->id, 'name' => $name], 'id DESC');
    if (!$recs) {
        fwrite(STDERR, "no LTI activity named '$name' in course {$course->shortname}\n");
        exit(3);
    }
    return reset($recs);
}
function grade_item_for($course, $lti) {
    return grade_item::fetch(['courseid' => $course->id, 'itemtype' => 'mod', 'itemmodule' => 'lti', 'iteminstance' => $lti->id, 'itemnumber' => 0]);
}

switch ($cmd) {
    case 'quiz-ws':
        // Tutor track, errors from Moodle quizzes (MOODLE_QUIZ_IMPORT_PLAN v2): what a school's Moodle admin does by hand.
        set_config('enablewebservices', 1);
        $protocols = array_filter(explode(',', (string) get_config('core', 'webserviceprotocols')));
        if (!in_array('rest', $protocols)) { $protocols[] = 'rest'; set_config('webserviceprotocols', implode(',', $protocols)); }
        $service = $DB->get_record('external_services', ['shortname' => 'enara_quiz_read']);
        if (!$service) {
            $id = $DB->insert_record('external_services', (object) ['name' => 'ENARA quiz results (read-only)', 'shortname' => 'enara_quiz_read', 'enabled' => 1, 'restrictedusers' => 0, 'downloadfiles' => 0, 'uploadfiles' => 0, 'timecreated' => time(), 'component' => null]);
            $service = $DB->get_record('external_services', ['id' => $id], '*', MUST_EXIST);
        }
        foreach (['mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_attempt_review'] as $fn) {
            if (!$DB->record_exists('external_services_functions', ['externalserviceid' => $service->id, 'functionname' => $fn])) {
                $DB->insert_record('external_services_functions', (object) ['externalserviceid' => $service->id, 'functionname' => $fn]);
            }
        }
        $token = \core_external\util::generate_token(EXTERNAL_TOKEN_PERMANENT, $service, get_admin()->id, context_system::instance());
        out(['service' => (int) $service->id, 'token' => $token]);

    case 'quiz-setup':
        // The data generators, loaded the way Moodle's own CLI course generator does (admin/tool/generator).
        require_once($CFG->dirroot . '/lib/phpunit/classes/util.php');
        require_once($CFG->dirroot . '/mod/quiz/locallib.php');
        try {
        $course = course_by_short(opt($opts, 'course'));
        $name = opt($opts, 'name');
        $student = user_by_name(opt($opts, 'user'));
        $answer = opt($opts, 'answer', 'False');
        $gen = phpunit_util::get_data_generator();
        $quiz = $DB->get_record('quiz', ['course' => $course->id, 'name' => $name]);
        if (!$quiz) {
            $quiz = $gen->get_plugin_generator('mod_quiz')->create_instance(['course' => $course->id, 'name' => $name, 'attempts' => 1, 'grade' => 10, 'sumgrades' => 1]);
            $qgen = $gen->get_plugin_generator('core_question');
            $cat = $qgen->create_question_category(['contextid' => context_course::instance($course->id)->id]);
            $q = $qgen->create_question('truefalse', null, ['category' => $cat->id]);
            quiz_add_quiz_question($q->id, $quiz);
            $quiz = $DB->get_record('quiz', ['id' => $quiz->id], '*', MUST_EXIST);
        }
        $existing = $DB->get_records('quiz_attempts', ['quiz' => $quiz->id, 'userid' => $student->id, 'state' => 'finished']);
        if (!$existing) {
            \core\session\manager::set_user($student);
            $qz = $gen->get_plugin_generator('mod_quiz');
            $attempt = $qz->create_attempt($quiz->id, $student->id);
            $qz->submit_responses($attempt->id, [1 => $answer], false, true);
            \core\session\manager::set_user(get_admin());
        }
        } catch (\Throwable $e) {
            // Shown in the scenario's failure message (the E2E summary keeps only the first line of a failed command).
            out(['error' => get_class($e) . ': ' . substr($e->getMessage(), 0, 300) . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . (property_exists($e, 'debuginfo') && $e->debuginfo ? ' | ' . substr((string) $e->debuginfo, 0, 300) : '')]);
        }
        $att = $DB->get_records('quiz_attempts', ['quiz' => $quiz->id, 'userid' => $student->id], 'id DESC', 'id, state');
        out(['quiz' => (int) $quiz->id, 'course' => (int) $course->id, 'user' => (int) $student->id, 'attempts' => array_values(array_map(fn($a) => ['id' => (int) $a->id, 'state' => $a->state], $att))]);

    case 'version':
        out(['release' => $CFG->release, 'version' => $CFG->version]);

    case 'provision': {
        $password = opt($opts, 'password');
        $made = ['users' => [], 'courses' => []];
        // The admin account (from install_database.php) gets the same test password.
        foreach (USERS as $u) {
            $existing = $DB->get_record('user', ['username' => $u['username'], 'deleted' => 0]);
            if ($existing) {
                $made['users'][$u['username']] = (int) $existing->id;
                continue;
            }
            $id = user_create_user((object) [
                'username' => $u['username'], 'firstname' => $u['firstname'], 'lastname' => $u['lastname'],
                'email' => $u['username'] . '@school.test', 'password' => $password, 'auth' => 'manual',
                'confirmed' => 1, 'mnethostid' => $CFG->mnet_localhost_id, 'lang' => 'en',
            ], true, false);
            $made['users'][$u['username']] = (int) $id;
        }
        $cats = [];
        foreach (['School A', 'School B', 'School C'] as $name) {
            $cat = $DB->get_record('course_categories', ['name' => $name]);
            if (!$cat) {
                $cat = \core_course_category::create(['name' => $name, 'idnumber' => strtoupper(str_replace(' ', '', $name))]);
            }
            $cats[$name] = (int) $cat->id;
        }
        foreach (COURSES as $c) {
            $course = $DB->get_record('course', ['shortname' => $c['shortname']]);
            if (!$course) {
                $course = create_course((object) [
                    'fullname' => $c['fullname'], 'shortname' => $c['shortname'], 'category' => $cats[$c['category']],
                    'format' => 'topics', 'numsections' => 1, 'visible' => 1,
                ]);
            }
            $made['courses'][$c['shortname']] = (int) $course->id;
        }
        foreach (ENROLMENTS as [$short, $username, $role]) {
            do_enrol($username, $short, $role);
        }
        $made['categories'] = $cats;
        // Teachers may switch role to student (Moodle default); make sure it is allowed.
        out($made);
    }

    case 'tools': {
        $types = $DB->get_records('lti_types', null, 'id ASC');
        $list = [];
        foreach ($types as $t) {
            $cats = $DB->get_fieldset_select('lti_types_categories', 'categoryid', 'typeid = ?', [$t->id]);
            $cfg = $DB->get_records_menu('lti_types_config', ['typeid' => $t->id], '', 'name, value');
            $list[] = [
                'id' => (int) $t->id, 'name' => $t->name, 'state' => (int) $t->state, 'coursevisible' => (int) $t->coursevisible,
                'clientid' => $t->clientid, 'baseurl' => $t->baseurl, 'tooldomain' => $t->tooldomain, 'categories' => array_map('intval', $cats),
                'acceptgrades' => $cfg['acceptgrades'] ?? null, 'contentitem' => $cfg['contentitem'] ?? null,
                'ltiservice_gradesynchronization' => $cfg['ltiservice_gradesynchronization'] ?? null,
                'ltiservice_memberships' => $cfg['ltiservice_memberships'] ?? null,
                'launchcontainer' => $cfg['launchcontainer'] ?? null,
            ];
        }
        out(['tools' => $list]);
    }

    case 'tool-settings': {
        $category = opt($opts, 'category');
        $type = !empty($opts['typeid'])
            ? $DB->get_record('lti_types', ['id' => (int) $opts['typeid']], '*', MUST_EXIST)
            : $DB->get_record('lti_types', ['name' => opt($opts, 'name')], '*', MUST_EXIST);
        $catid = (int) $DB->get_field('course_categories', 'id', ['name' => $category], MUST_EXIST);
        // 1. Activate (Manage tools › Activate).
        // 2. Tool configuration usage: Show in activity chooser and as a preconfigured tool.
        $DB->update_record('lti_types', (object) ['id' => $type->id, 'state' => LTI_TOOL_STATE_CONFIGURED, 'coursevisible' => LTI_COURSEVISIBLE_ACTIVITYCHOOSER, 'timemodified' => time()]);
        // 3. Privacy › Accept grades from the tool: Always.
        lti_update_config((object) ['typeid' => $type->id, 'name' => 'acceptgrades', 'value' => LTI_SETTING_ALWAYS]);
        // 4. Restrict to category (Moodle 4.3+).
        $DB->delete_records('lti_types_categories', ['typeid' => $type->id]);
        $DB->insert_record('lti_types_categories', (object) ['typeid' => $type->id, 'categoryid' => $catid]);
        purge_all_caches();
        out(['typeid' => (int) $type->id, 'category' => $catid]);
    }

    case 'tool-acceptgrades': {
        $typeid = (int) opt($opts, 'typeid');
        $value = (int) opt($opts, 'value');
        if (!in_array($value, [LTI_SETTING_NEVER, LTI_SETTING_ALWAYS, LTI_SETTING_DELEGATE], true)) {
            fwrite(STDERR, "--value must be 0, 1 or 2\n");
            exit(2);
        }
        $DB->get_record('lti_types', ['id' => $typeid], 'id', MUST_EXIST);
        lti_update_config((object) ['typeid' => $typeid, 'name' => 'acceptgrades', 'value' => $value]);
        purge_all_caches();
        $cfg = $DB->get_records_menu('lti_types_config', ['typeid' => $typeid], '', 'name, value');
        out(['typeid' => $typeid, 'acceptgrades' => (int) ($cfg['acceptgrades'] ?? -1)]);
    }

    case 'enrol':
        out(do_enrol(opt($opts, 'user'), opt($opts, 'course'), opt($opts, 'role', 'student')));

    case 'unenrol': {
        $course = course_by_short(opt($opts, 'course'));
        $user = user_by_name(opt($opts, 'user'));
        enrol_get_plugin('manual')->unenrol_user(manual_instance($course), $user->id);
        out(['course' => (int) $course->id, 'user' => (int) $user->id, 'unenrolled' => true]);
    }

    case 'activities': {
        $course = course_by_short(opt($opts, 'course'));
        $mod = $DB->get_record('modules', ['name' => 'lti'], '*', MUST_EXIST);
        $list = [];
        foreach ($DB->get_records('lti', ['course' => $course->id], 'id ASC') as $l) {
            $cmid = $DB->get_field('course_modules', 'id', ['module' => $mod->id, 'instance' => $l->id]);
            $gi = grade_item_for($course, $l);
            $list[] = ['id' => (int) $l->id, 'cmid' => (int) $cmid, 'name' => $l->name, 'typeid' => (int) $l->typeid, 'intro' => $l->intro,
                'instructorcustomparameters' => $l->instructorcustomparameters, 'grademax' => $gi ? (float) $gi->grademax : null,
                'gradetype' => $gi ? (int) $gi->gradetype : null];
        }
        out(['course' => (int) $course->id, 'activities' => $list]);
    }

    case 'grade': {
        $course = course_by_short(opt($opts, 'course'));
        $lti = lti_activity($course, $opts['activity'] ?? '');
        $user = user_by_name(opt($opts, 'user'));
        $gi = grade_item_for($course, $lti);
        if (!$gi) out(['gradeitem' => null]);
        $gg = grade_grade::fetch(['itemid' => $gi->id, 'userid' => $user->id]);
        out([
            'gradeitem' => (int) $gi->id, 'grademax' => (float) $gi->grademax,
            'finalgrade' => $gg && $gg->finalgrade !== null ? (float) $gg->finalgrade : null,
            'rawgrade' => $gg && $gg->rawgrade !== null ? (float) $gg->rawgrade : null,
            'overridden' => $gg ? (int) $gg->overridden : 0,
        ]);
    }

    case 'set-grade': {
        $course = course_by_short(opt($opts, 'course'));
        $lti = lti_activity($course, $opts['activity'] ?? '');
        $user = user_by_name(opt($opts, 'user'));
        $gi = grade_item_for($course, $lti);
        // What the grader report does when a teacher types a grade: source 'gradebook' (overridden).
        $ok = $gi->update_final_grade($user->id, (float) opt($opts, 'grade'), 'gradebook');
        $gg = grade_grade::fetch(['itemid' => $gi->id, 'userid' => $user->id]);
        out(['ok' => (bool) $ok, 'finalgrade' => (float) $gg->finalgrade, 'overridden' => (int) $gg->overridden]);
    }

    default:
        fwrite(STDERR, "unknown command\n");
        exit(2);
}
