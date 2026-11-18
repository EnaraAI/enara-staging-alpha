<?php
// Moodle config for the ENARA LMS end-to-end suite (Docker only, fake data).
// Mounted over the checkout's config.php. Works for 4.5 (code at the root) and
// 5.1+ (code under public/, config.php at the root).
unset($CFG);
global $CFG;
$CFG = new stdClass();

$CFG->dbtype    = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost    = 'postgres';
$CFG->dbname    = 'moodle';
$CFG->dbuser    = 'moodle';
$CFG->dbpass    = 'moodle';
$CFG->prefix    = 'mdl_';
$CFG->dboptions = ['dbpersist' => 0, 'dbport' => 5432];

// Caddy terminates TLS in front of Apache (http on :80 inside the network).
$CFG->wwwroot   = 'https://' . (getenv('MOODLE_HOST') ?: 'moodle.school.test');
$CFG->sslproxy  = true;
$CFG->dataroot  = '/var/www/moodledata';
$CFG->admin     = 'admin';
$CFG->directorypermissions = 02777;

// Server-to-server calls (ENARA's JWKS, dynamic registration, the tool's
// token / AGS / NRPS calls into Moodle) go to hosts on the private Docker
// network. Moodle's cURL security blocks private addresses by default.
$CFG->curlsecurityblockedhosts = '';
$CFG->curlsecurityallowedport = '';

// Quiet, fast test site.
$CFG->noemailever = true;
$CFG->debug = 5; // DEBUG_MINIMAL: errors only (no debugging() notices in CLI output)
$CFG->debugdisplay = 0;
$CFG->cachejs = true;
$CFG->themedesignermode = false;
$CFG->passwordpolicy = 0;
$CFG->enablecompletion = 1;
$CFG->forced_plugin_settings = [];

require_once(__DIR__ . '/lib/setup.php');
