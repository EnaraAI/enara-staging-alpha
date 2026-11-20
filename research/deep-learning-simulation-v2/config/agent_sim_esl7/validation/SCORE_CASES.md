# SIMULATION ONLY: ESL7 scoring validation cases (60 answers)

Score each answer. Scales:
- exact items (scoring exact): 1 if the answer is right for the question (an accepted answer or the same meaning; ignore capitals and a final full stop), else 0.
- target_form_0_1_2: 0, 1 or 2 by the rubric line given.
- rubric_0_3 (writing): task 0-3 plus language 0-3 by the rubric given; report the total 0-6.

## V-001  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your best friend. Say the name, the age and one thing your friend has. Model sentence: My cousin is six.
Key: My best friend is Maya. She is eight years old. She has a small brown dog. She is very funny.  | Also accepted: ["My best friend is Yusuf. He is twelve. He has a red bike. He is tall and kind.", "My friend's name is Leila. She is nine years old. She has two brothers."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: my friend name Ali he is nine he have a ball

## V-002  (scoring: exact)
Item: Read the message from Lily. Hi Tom! My birthday party is not on Friday. It is on Saturday. My cousins come at 3:00, and you come at 4:00. My house in River Road is small. The party is at my aunt's house in Park Street. My brother Adam is 12 and my sister Rana is 9. Love, Lily Complete: Rana is ___ years old. (1 or 2 words from the text)
Key: 9  | Also accepted: ["9", "nine"]
Target: find a name, number, time, day or place in a very short text
ANSWER: 12

## V-003  (scoring: target_form_0_1_2)
Item: Now you ask. Write a question to the tutor: ask about the tutor's favourite food.
Key: What is your favourite food?  | Also accepted: ["What is your favourite food?", "What is your favourite food, teacher?", "What food is your favourite?"]
Target: ask a personal question: Wh-word + is/are + subject
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: What is your favourite food?

## V-004  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your family. Say who is in your family and one thing about two people. Model sentence: My uncle has a shop.
Key: My family is big. My mother is a teacher. My father has a blue car. I have one sister.  | Also accepted: ["My family is small. My dad is a doctor. My mum has long hair. I have a baby brother.", "I have two sisters. They are funny. My grandfather is old. He has a garden."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: my family is mother father brother and me my brother is five

## V-005  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about you. Say your name, your age, where you are from and one thing you have. Model sentence: I am a student.
Key: I am Hassan. I am eleven years old. I am from Jordan. I have a green bag.  | Also accepted: ["My name is Noor. I am seven. I am from Egypt. I have a white rabbit.", "I am Ali. I am thirty years old. I am from Oman. I have a big family."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I am Mona. I am 7. I am from Saudi Arabia. I have a doll.

## V-006  (scoring: exact)
Item: Read the email from Nadia. Hi Sara, I hope you and your family are well. Last week our class visited the science museum, and it was great! But I am writing because I need your help. Our teacher wants us to make a poster about the museum by next Monday. I have some photos, but I can't draw well. You are very good at drawing because you practise every day. Can you help me on Saturday afternoon? We can work at the library from 2:00 to 5:00, or at my house after that. My mum will make pizza for us. Please write back soon. Best wishes, Nadia Complete: After 5:00 they can work at Nadia's ___. (1 or 2 words from the text)
Key: house  | Also accepted: ["house", "home"]
Target: find the main idea and specific details in a short everyday text
ANSWER: house

## V-007  (scoring: target_form_0_1_2)
Item: Tutor: How old are you? Write your answer as one sentence.
Key: I am nine years old.  | Also accepted: ["I am nine years old.", "I am eight.", "I am twelve."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: I am ten years old.

## V-008  (scoring: exact)
Item: Read the pool notice. CITY SWIMMING POOL. Mr Karim teaches the children. Miss Dina teaches the adults. The children's class is not on Tuesday. It is on Wednesday. Adults swim at 6:00. Children swim at 5:00. Children pay 3 dollars. Adults pay 5 dollars. Do not leave your bags by the pool. Put them in the blue room. Complete: Children swim at ___. (1 or 2 words from the text)
Key: 5:00  | Also accepted: ["5:00", "5.00", "5", "five", "5 o'clock", "five o'clock"]
Target: find a name, number, time, day or place in a very short text
ANSWER: 6:00

## V-009  (scoring: target_form_0_1_2)
Item: Tutor: Good morning! What is your favourite colour? Write your answer as one sentence.
Key: My favourite colour is blue.  | Also accepted: ["My favourite colour is blue.", "My favourite colour is green.", "I like red. It is my favourite colour."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: my favourite colour blue

## V-010  (scoring: exact)
Item: Read the pool notice. CITY SWIMMING POOL. Mr Karim teaches the children. Miss Dina teaches the adults. The children's class is not on Tuesday. It is on Wednesday. Adults swim at 6:00. Children swim at 5:00. Children pay 3 dollars. Adults pay 5 dollars. Do not leave your bags by the pool. Put them in the blue room. Complete: The children's class is on ___. (1 or 2 words from the text)
Key: Wednesday  | Also accepted: ["Wednesday"]
Target: find a name, number, time, day or place in a very short text
ANSWER: wednesday

## V-011  (scoring: exact)
Item: Read the library notice. SCHOOL LIBRARY. Mr Sami is here in the morning. Mrs Hana is here in the afternoon. Monday to Thursday: we open at 8:30. Friday: we open at 10:00. You can take 2 books for 7 days. Do not leave books in Room 4. Bring them back to Room 12. Complete: On Friday the library opens at ___. (1 or 2 words from the text)
Key: 10:00  | Also accepted: ["10:00", "10.00", "10", "ten", "10 o'clock", "ten o'clock"]
Target: find a name, number, time, day or place in a very short text
ANSWER: 10

## V-012  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your family. Say who is in your family and one thing about two people. Model sentence: My uncle has a shop.
Key: My family is big. My mother is a teacher. My father has a blue car. I have one sister.  | Also accepted: ["My family is small. My dad is a doctor. My mum has long hair. I have a baby brother.", "I have two sisters. They are funny. My grandfather is old. He has a garden."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I have a family. My father is a doctor and my mother is a teacher. I have one sister.

## V-013  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your best friend. Say the name, the age and one thing your friend has. Model sentence: My cousin is six.
Key: My best friend is Maya. She is eight years old. She has a small brown dog. She is very funny.  | Also accepted: ["My best friend is Yusuf. He is twelve. He has a red bike. He is tall and kind.", "My friend's name is Leila. She is nine years old. She has two brothers."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: My best friend is Yara. She is eight. She has a red bike. She is nice.

## V-014  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your family. Say who is in your family and one thing about two people. Model sentence: My uncle has a shop.
Key: My family is big. My mother is a teacher. My father has a blue car. I have one sister.  | Also accepted: ["My family is small. My dad is a doctor. My mum has long hair. I have a baby brother.", "I have two sisters. They are funny. My grandfather is old. He has a garden."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I have mother and father. My mother is nice. My father have a shop.

## V-015  (scoring: target_form_0_1_2)
Item: Now you ask. Write a question to the tutor: ask where the tutor is from.
Key: Where are you from?  | Also accepted: ["Where are you from?", "Where are you from, teacher?", "What country are you from?"]
Target: ask a personal question: Wh-word + is/are + subject
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Where are you from?

## V-016  (scoring: target_form_0_1_2)
Item: You are at a friend's house. You are thirsty. Write one sentence to your friend's mother.
Key: Could I have a glass of water, please?  | Also accepted: ["Could I have a glass of water, please?", "Can I have some juice, please?", "Could I have something to drink, please?"]
Target: request: Can/Could I ... please?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Give me water.

## V-017  (scoring: target_form_0_1_2)
Item: Tutor: How many brothers and sisters do you have? Write your answer as one sentence.
Key: I have one brother and two sisters.  | Also accepted: ["I have one brother and two sisters.", "I have three brothers.", "I do not have brothers or sisters."]
Target: answer a personal question: full simple sentence (subject + verb)
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: I have two brothers and one sister

## V-018  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about you. Say your name, your age, where you are from and one thing you have. Model sentence: I am a student.
Key: I am Hassan. I am eleven years old. I am from Jordan. I have a green bag.  | Also accepted: ["My name is Noor. I am seven. I am from Egypt. I have a white rabbit.", "I am Ali. I am thirty years old. I am from Oman. I have a big family."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I am Sara. I am student. I am from Syria. I have a cat.

## V-019  (scoring: exact)
Item: Read the pool notice. CITY SWIMMING POOL. Mr Karim teaches the children. Miss Dina teaches the adults. The children's class is not on Tuesday. It is on Wednesday. Adults swim at 6:00. Children swim at 5:00. Children pay 3 dollars. Adults pay 5 dollars. Do not leave your bags by the pool. Put them in the blue room. Question: Who teaches the adults? (a) Mr Karim (b) Miss Dina (c) Mrs Salma
Options: {"a": "Mr Karim", "b": "Miss Dina", "c": "Mrs Salma"}
Key: b  | Also accepted: ["b"]
Target: find a name, number, time, day or place in a very short text
ANSWER: b

## V-020  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about you. Say your name, your age, where you are from and one thing you have. Model sentence: I am a student.
Key: I am Hassan. I am eleven years old. I am from Jordan. I have a green bag.  | Also accepted: ["My name is Noor. I am seven. I am from Egypt. I have a white rabbit.", "I am Ali. I am thirty years old. I am from Oman. I have a big family."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: My name is Omar. I am 12 years old. I am from Egypt. I have a new phone.

## V-021  (scoring: rubric_0_3)
Item: Write 30-50 words about a trip with your class or a day out. Say where you went, what you saw and what you liked or did not like. Use and, but and because.
Key: Last month my class went to the zoo by bus. We saw lions and elephants, but we did not see the bears because they were asleep. I liked the monkeys because they were funny. Then we went back to school.  | Also accepted: ["Last spring we visited an old castle with our teacher. We saw big rooms and old pictures, but we did not go up the tower. I liked the garden because it had many flowers.", "In March my class went to a farm. We fed the goats and we saw a very big horse. I did not like the smell, but the farmer was kind. It was a good day because we learned a lot."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: Last week my class went to the museum. We saw old things and big bones. I liked it because it was interesting, but it was too long and I was tired.

## V-022  (scoring: target_form_0_1_2)
Item: Tutor: Is the room too hot for you? Write your answer as one sentence.
Key: Yes, it is too hot.  | Also accepted: ["Yes, it is too hot.", "No, it is OK, thank you.", "Yes, I am very hot."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: yes hot

## V-023  (scoring: rubric_0_3)
Item: Write 30-50 words about your last weekend. Say where you went, what you did and how you felt. Use and, but and because.
Key: Last weekend I visited my grandparents in their village. We ate lunch in the garden and played football. It was very hot, but we had fun. I was tired on Sunday because we came home late.  | Also accepted: ["Last Saturday I went to the beach with my family. The water was cold, but I swam with my brother. We ate sandwiches and drank juice. I was happy because the sun was out all day.", "Last weekend I stayed in my town. On Friday I went to the market with my mother and we bought fruit. I wanted to play football, but it rained. I felt bored because I was at home on Saturday."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: last weekend i go to beach and swim and I feel happy because the water is cold

## V-024  (scoring: rubric_0_3)
Item: Write 30-50 words about a trip with your class or a day out. Say where you went, what you saw and what you liked or did not like. Use and, but and because.
Key: Last month my class went to the zoo by bus. We saw lions and elephants, but we did not see the bears because they were asleep. I liked the monkeys because they were funny. Then we went back to school.  | Also accepted: ["Last spring we visited an old castle with our teacher. We saw big rooms and old pictures, but we did not go up the tower. I liked the garden because it had many flowers.", "In March my class went to a farm. We fed the goats and we saw a very big horse. I did not like the smell, but the farmer was kind. It was a good day because we learned a lot."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I went to the park with my school. We saw many trees and birds. I liked it because we played games. But the food was not good.

## V-025  (scoring: exact)
Item: Read the library notice. SCHOOL LIBRARY. Mr Sami is here in the morning. Mrs Hana is here in the afternoon. Monday to Thursday: we open at 8:30. Friday: we open at 10:00. You can take 2 books for 7 days. Do not leave books in Room 4. Bring them back to Room 12. Complete: The library opens at 10:00 on ___. (1 or 2 words from the text)
Key: Friday  | Also accepted: ["Friday"]
Target: find a name, number, time, day or place in a very short text
ANSWER: Friday

## V-026  (scoring: exact)
Item: Read the story. Last Saturday morning, the sky was grey and it was cold. Omar and his father took the 9:00 bus to the market because their car was broken. They wanted to buy a present for Omar's grandmother. Her birthday was on Sunday. First they looked at scarves, but they were too expensive. Omar's father had only 6 dollars in his pocket. Then Omar saw a small green plant for 8 dollars, so he paid the other 2 dollars with his own money. They took the 11:30 bus home. On Sunday, Grandmother put the plant next to her window and smiled. It was the best present. Complete: Omar and his father went home on the ___ bus. (1 or 2 words from the text)
Key: 11:30  | Also accepted: ["11:30", "11.30"]
Target: find the main idea and specific details in a short everyday text
ANSWER: 9:00

## V-027  (scoring: exact)
Item: Read the story. Last Saturday morning, the sky was grey and it was cold. Omar and his father took the 9:00 bus to the market because their car was broken. They wanted to buy a present for Omar's grandmother. Her birthday was on Sunday. First they looked at scarves, but they were too expensive. Omar's father had only 6 dollars in his pocket. Then Omar saw a small green plant for 8 dollars, so he paid the other 2 dollars with his own money. They took the 11:30 bus home. On Sunday, Grandmother put the plant next to her window and smiled. It was the best present. Question: When was Grandmother's birthday? (a) on Saturday (b) on Sunday (c) on Monday
Options: {"a": "on Saturday", "b": "on Sunday", "c": "on Monday"}
Key: b  | Also accepted: ["b"]
Target: find the main idea and specific details in a short everyday text
ANSWER: b

## V-028  (scoring: target_form_0_1_2)
Item: Tutor: Hi! I am your new teacher. What is your name? Write your answer as one sentence.
Key: My name is Lina.  | Also accepted: ["My name is Lina.", "I am Omar.", "My name is Sara."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: My name is Lina.

## V-029  (scoring: target_form_0_1_2)
Item: You are late for class. Write one sentence to your teacher. Say sorry and why.
Key: I'm sorry I'm late because my bus was late.  | Also accepted: ["I'm sorry I'm late because my bus was late.", "Sorry I'm late, but the traffic was very bad.", "I'm sorry I'm late because I missed the bus."]
Target: apologise: I'm sorry + because/but + reason
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Sorry I am late because bus was late.

## V-030  (scoring: exact)
Item: Read the email from Nadia. Hi Sara, I hope you and your family are well. Last week our class visited the science museum, and it was great! But I am writing because I need your help. Our teacher wants us to make a poster about the museum by next Monday. I have some photos, but I can't draw well. You are very good at drawing because you practise every day. Can you help me on Saturday afternoon? We can work at the library from 2:00 to 5:00, or at my house after that. My mum will make pizza for us. Please write back soon. Best wishes, Nadia Complete: At the library they can work until ___. (1 or 2 words from the text)
Key: 5:00  | Also accepted: ["5:00", "5.00", "5", "five", "5 o'clock", "five o'clock"]
Target: find the main idea and specific details in a short everyday text
ANSWER: 5 o'clock

## V-031  (scoring: exact)
Item: Read the email from Nadia. Hi Sara, I hope you and your family are well. Last week our class visited the science museum, and it was great! But I am writing because I need your help. Our teacher wants us to make a poster about the museum by next Monday. I have some photos, but I can't draw well. You are very good at drawing because you practise every day. Can you help me on Saturday afternoon? We can work at the library from 2:00 to 5:00, or at my house after that. My mum will make pizza for us. Please write back soon. Best wishes, Nadia Question: Why is Nadia writing to Sara? (a) to ask about Sara's family (b) to ask for help with a poster (c) to tell Sara about pizza
Options: {"a": "to ask about Sara's family", "b": "to ask for help with a poster", "c": "to tell Sara about pizza"}
Key: b  | Also accepted: ["b"]
Target: find the main idea and specific details in a short everyday text
ANSWER: b

## V-032  (scoring: rubric_0_3)
Item: Write 30-50 words about a day with bad weather. Say what the weather was like, what you did and how you felt. Use and, but and because.
Key: Last Friday it was rainy and windy. I wanted to go to the park, but my mum said no. We stayed at home and played a board game. I was happy because my cousins came too.  | Also accepted: ["Two weeks ago it was very cold and it snowed. We did not go to school because the roads were closed. I made a snowman with my sister, but my hands were cold.", "Last winter there was a big storm. The wind was very strong, so we stayed inside. My father cooked soup and we watched a film. I was a bit scared, but it was also fun."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: It was storm and I stay home and I play with my brother and I feel sad because I can not go out

## V-033  (scoring: exact)
Item: Read the story. Last Saturday morning, the sky was grey and it was cold. Omar and his father took the 9:00 bus to the market because their car was broken. They wanted to buy a present for Omar's grandmother. Her birthday was on Sunday. First they looked at scarves, but they were too expensive. Omar's father had only 6 dollars in his pocket. Then Omar saw a small green plant for 8 dollars, so he paid the other 2 dollars with his own money. They took the 11:30 bus home. On Sunday, Grandmother put the plant next to her window and smiled. It was the best present. Question: How much was the plant? (a) 6 dollars (b) 8 dollars (c) 2 dollars
Options: {"a": "6 dollars", "b": "8 dollars", "c": "2 dollars"}
Key: b  | Also accepted: ["b"]
Target: find the main idea and specific details in a short everyday text
ANSWER: 8 dollar

## V-034  (scoring: target_form_0_1_2)
Item: You are at the train station. Ask when the next train leaves. Write one question.
Key: Excuse me, when does the next train leave?  | Also accepted: ["Excuse me, when does the next train leave?", "When does the next train leave, please?", "Could you tell me when the next train leaves?"]
Target: ask for information: Excuse me + Wh-question with does/is + subject, or Could you tell me ...?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: When the next train leave?

## V-035  (scoring: rubric_0_3)
Item: Write 30-50 words about your last weekend. Say where you went, what you did and how you felt. Use and, but and because.
Key: Last weekend I visited my grandparents in their village. We ate lunch in the garden and played football. It was very hot, but we had fun. I was tired on Sunday because we came home late.  | Also accepted: ["Last Saturday I went to the beach with my family. The water was cold, but I swam with my brother. We ate sandwiches and drank juice. I was happy because the sun was out all day.", "Last weekend I stayed in my town. On Friday I went to the market with my mother and we bought fruit. I wanted to play football, but it rained. I felt bored because I was at home on Saturday."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: I go to park. I play football. Happy.

## V-036  (scoring: exact)
Item: Read the pool notice. CITY SWIMMING POOL. Mr Karim teaches the children. Miss Dina teaches the adults. The children's class is not on Tuesday. It is on Wednesday. Adults swim at 6:00. Children swim at 5:00. Children pay 3 dollars. Adults pay 5 dollars. Do not leave your bags by the pool. Put them in the blue room. Complete: Adults pay ___ dollars. (1 or 2 words from the text)
Key: 5  | Also accepted: ["5", "five"]
Target: find a name, number, time, day or place in a very short text
ANSWER: five

## V-037  (scoring: target_form_0_1_2)
Item: Tutor: When is your birthday? Write your answer as one sentence.
Key: My birthday is in May.  | Also accepted: ["My birthday is in May.", "My birthday is on the tenth of June.", "It is in October."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: my birthday in May

## V-038  (scoring: rubric_0_3)
Item: Write 30-50 words about your last weekend. Say where you went, what you did and how you felt. Use and, but and because.
Key: Last weekend I visited my grandparents in their village. We ate lunch in the garden and played football. It was very hot, but we had fun. I was tired on Sunday because we came home late.  | Also accepted: ["Last Saturday I went to the beach with my family. The water was cold, but I swam with my brother. We ate sandwiches and drank juice. I was happy because the sun was out all day.", "Last weekend I stayed in my town. On Friday I went to the market with my mother and we bought fruit. I wanted to play football, but it rained. I felt bored because I was at home on Saturday."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: Last weekend I went to my grandmother house and I played with my cousins. I was happy because we ate good food. But it was hot and I was tired.

## V-039  (scoring: rubric_0_3)
Item: Write 30-50 words about a day with bad weather. Say what the weather was like, what you did and how you felt. Use and, but and because.
Key: Last Friday it was rainy and windy. I wanted to go to the park, but my mum said no. We stayed at home and played a board game. I was happy because my cousins came too.  | Also accepted: ["Two weeks ago it was very cold and it snowed. We did not go to school because the roads were closed. I made a snowman with my sister, but my hands were cold.", "Last winter there was a big storm. The wind was very strong, so we stayed inside. My father cooked soup and we watched a film. I was a bit scared, but it was also fun."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: Yesterday the weather was bad. It was rainy and cold so I stayed at home. I played games and I watched TV. I felt bored but my mother made hot tea and I was happy.

## V-040  (scoring: target_form_0_1_2)
Item: You are in a supermarket. Ask where the milk is. Write one question.
Key: Excuse me, where is the milk, please?  | Also accepted: ["Excuse me, where is the milk, please?", "Could you tell me where the milk is?", "Where can I find the milk, please?"]
Target: ask for information: Excuse me + Wh-question with does/is + subject, or Could you tell me ...?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Where is the milk?

## V-041  (scoring: target_form_0_1_2)
Item: Your classmate wants to do the project together. Write one sentence. Suggest a day and a time after school.
Key: How about Thursday at five o'clock?  | Also accepted: ["How about Thursday at five o'clock?", "Let's meet on Monday after school.", "Can we do it on Wednesday at 4:30?"]
Target: suggest a time: How about / Let's / Can we ... + day and time?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Let's meet on Monday at 4 o'clock after school.

## V-042  (scoring: rubric_0_3)
Item: Write 30-50 words about a day with bad weather. Say what the weather was like, what you did and how you felt. Use and, but and because.
Key: Last Friday it was rainy and windy. I wanted to go to the park, but my mum said no. We stayed at home and played a board game. I was happy because my cousins came too.  | Also accepted: ["Two weeks ago it was very cold and it snowed. We did not go to school because the roads were closed. I made a snowman with my sister, but my hands were cold.", "Last winter there was a big storm. The wind was very strong, so we stayed inside. My father cooked soup and we watched a film. I was a bit scared, but it was also fun."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: The weather was very hot and I did not go outside. I drank water and I read a book. I felt tired but happy because my friend called me.

## V-043  (scoring: target_form_0_1_2)
Item: Now you ask. Write a question to the tutor: ask about the tutor's job.
Key: What is your job?  | Also accepted: ["What is your job?", "What is your job, please?", "Excuse me, what is your job?"]
Target: ask a personal question: Wh-word + is/are + subject
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: You job?

## V-044  (scoring: exact)
Item: Read the library notice. SCHOOL LIBRARY. Mr Sami is here in the morning. Mrs Hana is here in the afternoon. Monday to Thursday: we open at 8:30. Friday: we open at 10:00. You can take 2 books for 7 days. Do not leave books in Room 4. Bring them back to Room 12. Complete: You can keep the books for ___ days. (1 or 2 words from the text)
Key: 7  | Also accepted: ["7", "seven"]
Target: find a name, number, time, day or place in a very short text
ANSWER: 7 days

## V-045  (scoring: exact)
Item: Read the email from Nadia. Hi Sara, I hope you and your family are well. Last week our class visited the science museum, and it was great! But I am writing because I need your help. Our teacher wants us to make a poster about the museum by next Monday. I have some photos, but I can't draw well. You are very good at drawing because you practise every day. Can you help me on Saturday afternoon? We can work at the library from 2:00 to 5:00, or at my house after that. My mum will make pizza for us. Please write back soon. Best wishes, Nadia Question: When does Nadia want to meet Sara? (a) last week (b) next Monday (c) on Saturday afternoon
Options: {"a": "last week", "b": "next Monday", "c": "on Saturday afternoon"}
Key: c  | Also accepted: ["c"]
Target: find the main idea and specific details in a short everyday text
ANSWER: b

## V-046  (scoring: exact)
Item: Read the letter from the school. Dear parents, The weather this week has been very hot, so please give your child a water bottle every day. Next Thursday, Class 5 will visit the City Zoo for our science project about animals. The bus will leave school at 8:15 and come back at 2:30. Each child needs 10 dollars for the ticket and lunch. Please do not give the money to the class teacher, Ms Laila. Send it to Mr Faris in the office by Tuesday. Children should wear their school T-shirt and comfortable shoes. If it rains, we will go to the Science Museum. Thank you, Mrs Amal, Head Teacher Question: When must parents send the money? (a) this week (b) next Thursday (c) by Tuesday
Options: {"a": "this week", "b": "next Thursday", "c": "by Tuesday"}
Key: c  | Also accepted: ["c"]
Target: find the main idea and specific details in a short everyday text
ANSWER: a

## V-047  (scoring: rubric_0_3)
Item: Write 30-50 words about a trip with your class or a day out. Say where you went, what you saw and what you liked or did not like. Use and, but and because.
Key: Last month my class went to the zoo by bus. We saw lions and elephants, but we did not see the bears because they were asleep. I liked the monkeys because they were funny. Then we went back to school.  | Also accepted: ["Last spring we visited an old castle with our teacher. We saw big rooms and old pictures, but we did not go up the tower. I liked the garden because it had many flowers.", "In March my class went to a farm. We fed the goats and we saw a very big horse. I did not like the smell, but the farmer was kind. It was a good day because we learned a lot."]
Target: linked simple sentences with and/but/because; past and present verb forms
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Partly on the topic, or fewer than 20 words.", "2": "On the topic with one asked point missing, or 20-29 or 51-60 words.", "3": "On the topic, every asked point, 30-50 words."}, "language": {"0": "No and/but/because joins two clauses, or five or more errors, or the text is one line with no full stops.", "1": "Only \"and\" joins clauses, or three or four errors.", "2": "But or because joins two clauses, and one or two errors.", "3": "At least two of and/but/because join clauses (one is but or because), and no errors."}, "errorCount": "One error = a wrong past or present verb form, a wrong he/she/it form, a missing am/is/are/was/were, a missing capital, or a missing full stop.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: we went to the zoo with my class and we saw lions and monkeys and i like the monkeys because they is funny

## V-048  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about you. Say your name, your age, where you are from and one thing you have. Model sentence: I am a student.
Key: I am Hassan. I am eleven years old. I am from Jordan. I have a green bag.  | Also accepted: ["My name is Noor. I am seven. I am from Egypt. I have a white rabbit.", "I am Ali. I am thirty years old. I am from Oman. I have a big family."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: My name is Hassan. I am 30 years old. I am from Iraq. I have a car.

## V-049  (scoring: exact)
Item: Read the library notice. SCHOOL LIBRARY. Mr Sami is here in the morning. Mrs Hana is here in the afternoon. Monday to Thursday: we open at 8:30. Friday: we open at 10:00. You can take 2 books for 7 days. Do not leave books in Room 4. Bring them back to Room 12. Question: Who is in the library in the afternoon? (a) Mr Sami (b) Mrs Hana (c) Mrs Lina
Options: {"a": "Mr Sami", "b": "Mrs Hana", "c": "Mrs Lina"}
Key: b  | Also accepted: ["b"]
Target: find a name, number, time, day or place in a very short text
ANSWER: b

## V-050  (scoring: exact)
Item: Read the letter from the school. Dear parents, The weather this week has been very hot, so please give your child a water bottle every day. Next Thursday, Class 5 will visit the City Zoo for our science project about animals. The bus will leave school at 8:15 and come back at 2:30. Each child needs 10 dollars for the ticket and lunch. Please do not give the money to the class teacher, Ms Laila. Send it to Mr Faris in the office by Tuesday. Children should wear their school T-shirt and comfortable shoes. If it rains, we will go to the Science Museum. Thank you, Mrs Amal, Head Teacher Question: What is the letter mostly about? (a) the hot weather (b) a class trip to the zoo (c) school T-shirts
Options: {"a": "the hot weather", "b": "a class trip to the zoo", "c": "school T-shirts"}
Key: b  | Also accepted: ["b"]
Target: find the main idea and specific details in a short everyday text
ANSWER: b

## V-051  (scoring: target_form_0_1_2)
Item: You are in a clothes shop. You want to try a jacket. Write one sentence to the shop assistant.
Key: Can I try this jacket, please?  | Also accepted: ["Can I try this jacket, please?", "Could I try this jacket on, please?", "Excuse me, can I try on this jacket, please?"]
Target: request: Can/Could I ... please?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Can I try this jacket, please?

## V-052  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your best friend. Say the name, the age and one thing your friend has. Model sentence: My cousin is six.
Key: My best friend is Maya. She is eight years old. She has a small brown dog. She is very funny.  | Also accepted: ["My best friend is Yusuf. He is twelve. He has a red bike. He is tall and kind.", "My friend's name is Leila. She is nine years old. She has two brothers."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: My friend is Khaled. He is ten. He has a dog

## V-053  (scoring: rubric_0_3)
Item: Write 3 or 4 sentences about your best friend. Say the name, the age and one thing your friend has. Model sentence: My cousin is six.
Key: My best friend is Maya. She is eight years old. She has a small brown dog. She is very funny.  | Also accepted: ["My best friend is Yusuf. He is twelve. He has a red bike. He is tall and kind.", "My friend's name is Leila. She is nine years old. She has two brothers."]
Target: simple sentences with capital letters and full stops; am/is/are and have/has
Rubric: {"task": {"0": "Nothing is written about the topic.", "1": "Only one of the asked points is written about the topic.", "2": "All asked points but one are written about the topic.", "3": "Every asked point is written about the topic."}, "language": {"0": "Four or more errors, or the text is one line with no full stops.", "1": "Two or three errors.", "2": "One error.", "3": "No errors: every sentence has a capital, a full stop and am/is/are or have/has where needed."}, "errorCount": "One error = a missing capital at the start of a sentence or in \"I\", a missing full stop, a missing or wrong am/is/are, or a wrong have/has.", "mastery": "Criterion met when task >= 2 and language >= 2 (outcome: level 2 of 3 on every criterion)."}
ANSWER: My best friend is Noor. She is seven years old. She has a big doll.

## V-054  (scoring: target_form_0_1_2)
Item: You forgot your friend's book at home. Write one sentence to your friend. Say sorry and why.
Key: I'm sorry, I forgot your book because I was in a hurry.  | Also accepted: ["I'm sorry, I forgot your book because I was in a hurry.", "Sorry, I don't have your book today because it is at home.", "I'm really sorry, but I left your book on my desk."]
Target: apologise: I'm sorry + because/but + reason
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Sorry, I forgot your book at home because I was in a hurry

## V-055  (scoring: exact)
Item: Read the message from Lily. Hi Tom! My birthday party is not on Friday. It is on Saturday. My cousins come at 3:00, and you come at 4:00. My house in River Road is small. The party is at my aunt's house in Park Street. My brother Adam is 12 and my sister Rana is 9. Love, Lily Complete: Tom comes to the party at ___. (1 or 2 words from the text)
Key: 4:00  | Also accepted: ["4:00", "4.00", "4", "four", "4 o'clock", "four o'clock"]
Target: find a name, number, time, day or place in a very short text
ANSWER: 4

## V-056  (scoring: target_form_0_1_2)
Item: Tutor: It is twelve o'clock. Are you hungry or thirsty? Write your answer as one sentence.
Key: I am hungry.  | Also accepted: ["I am hungry.", "I am thirsty.", "I am hungry and thirsty."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: I am hungry.

## V-057  (scoring: exact)
Item: Read the message from Lily. Hi Tom! My birthday party is not on Friday. It is on Saturday. My cousins come at 3:00, and you come at 4:00. My house in River Road is small. The party is at my aunt's house in Park Street. My brother Adam is 12 and my sister Rana is 9. Love, Lily Question: Where is the party? (a) in River Road (b) in Park Street (c) in School Road
Options: {"a": "in River Road", "b": "in Park Street", "c": "in School Road"}
Key: b  | Also accepted: ["b"]
Target: find a name, number, time, day or place in a very short text
ANSWER: a

## V-058  (scoring: target_form_0_1_2)
Item: Tutor: Hello! What is your mother's name? Write your answer as one sentence.
Key: My mother's name is Amal.  | Also accepted: ["My mother's name is Amal.", "Her name is Huda.", "My mum is Salma."]
Target: answer a personal question: full simple sentence with am/is/are
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: My mother Fatima.

## V-059  (scoring: target_form_0_1_2)
Item: You are in class. You do not have a ruler. Write one sentence to your classmate.
Key: Can I borrow your ruler, please?  | Also accepted: ["Can I borrow your ruler, please?", "Could I use your ruler, please?", "Can you lend me your ruler, please?"]
Target: request: Can/Could I ... please?
Rubric: 2 = appropriate phrase for the function (polite request, sorry + reason, suggestion with a time, polite question) in a complete sentence; 1 = function done with one error (e.g. no please, no reason, or statement word order in the question); 0 = function missing, a bare order or "I want", or not a sentence. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: Can I borrow your ruler please

## V-060  (scoring: target_form_0_1_2)
Item: Tutor: Where do you live? Write your answer as one sentence.
Key: I live in Amman.  | Also accepted: ["I live in Amman.", "I live in a flat in Dubai.", "I live in Cairo with my family."]
Target: answer a personal question: full simple sentence (subject + verb)
Rubric: 2 = a relevant full simple sentence (subject + verb, am/is/are where needed); 1 = relevant sentence with one error (e.g. am/is/are missing); 0 = one word, a fragment with no verb, or not relevant. Other errors are not scored. Criterion: 4 of 5 items score 2.
ANSWER: I live in Amman.
