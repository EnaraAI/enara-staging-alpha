# Spelling dictionaries: attribution and licences

These files are used by the rules-first grader (`backend/src/assessment/text/dictionaries.ts`) to check spelling in learners'
written answers. The third-party files are shipped **unmodified**, each next to its own licence files.

## English: `en_US/` (`en_US.dic`, `en_US.aff`, `README_en_US.txt`)

English word list derived from SCOWL (Spell Checker Oriented Word Lists), http://wordlist.aspell.net. Copyright 2000-2018 by Kevin Atkinson and the other copyright holders listed in README_en_US.txt.

Source: the LibreOffice dictionaries repository, `en/` (https://github.com/LibreOffice/dictionaries), en_US Hunspell dictionary
version 2020.12.07. The full copyright and permission notice is in `en_US/README_en_US.txt`.

## Arabic: `ar/` (`ar.dic`, `ar.aff`, `COPYING`, `AUTHORS`, `README-en`)

Arabic spelling dictionary: Ayaspell / hunspell-ar 3.5 (2014), © 2006-2008 Mohamed Kebdani and the Ayaspell project contributors (Taha Zerrouki et al.), https://ayaspell.sourceforge.net. Used under the Mozilla Public License 1.1 (part of the GPL 2.0/LGPL 2.1/MPL 1.1 tri-license); source available at the above URL.

Source: `hunspell-ar_3.5.2014-11-08.zip` from https://sourceforge.net/projects/ayaspell/files/ (files as released, not modified).

## Our own additions: `enara/` (`allow-en.txt`, `allow-ar.txt`)

Words ENARA accepts in addition to the dictionaries above (school words, Egyptian places, local food, common loanwords). These
files are ENARA's own and are kept separate from the third-party files.
