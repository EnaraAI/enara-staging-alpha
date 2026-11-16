# ENARA multi-skill benchmark v1: original synthetic lesson content (no third-party text).
# Each item: id, prompt, acc (accepted answers; [] = open task, tutor judges), forms (tested forms),
# wrong (a typical learner error), partial (a partly right attempt), right (a correct learner answer).
L = []
def lesson(skill, cefr, title, objective, crit, vocab, grammar, functions, examples, items, skills=None):
    L.append(dict(skill=skill, cefr=cefr, title=title, objective=objective, successCriteria=crit, vocabulary=vocab,
                  grammar=grammar, functions=functions, examples=examples, items=items, skills=skills or [skill if skill in ('reading','writing','listening','speaking') else 'integrated']))
def it(i, prompt, acc, forms, wrong, partial, right): return dict(id=i, prompt=prompt, acc=acc, forms=forms, wrong=wrong, partial=partial, right=right)

# ---------------- VOCABULARY ----------------
lesson('vocabulary','A1','Food I like','Name common foods and say what you like.',['Names the food correctly','Uses "I like ..." with a food word'],
  ['bread','rice','apple','milk','egg','fish'],['I like ...'],['expressing likes'],['I like rice.','I like apples.'],
  [it('v1','Write the word: you drink it, it is white. ___',['milk'],['milk'],'water','mil','milk'),
   it('v2','Complete: "I eat an ___ every morning." (a red or green fruit)',['apple','an apple'],['apple'],'orange juice','appel','apple')])
lesson('vocabulary','A1','Things in my classroom','Name classroom objects.',['Names the object correctly','Uses "This is a ..."'],
  ['desk','chair','pen','book','board','bag'],['This is a ...'],['naming objects'],['This is a pen.','This is a chair.'],
  [it('v1','Complete: "I sit on a ___."',['chair','a chair'],['chair'],'table','chiar','chair'),
   it('v2','Complete: "The teacher writes on the ___."',['board','the board'],['board'],'book','bord','board')])
lesson('vocabulary','A2','Jobs and workplaces','Match jobs to workplaces.',['Chooses the right workplace word','Uses "works in/at"'],
  ['nurse','hospital','chef','restaurant','farmer','farm','pilot','airport'],['He/She works in/at ...'],['describing jobs'],['A teacher works at a school.'],
  [it('v1','Complete: "A chef works in a ___."',['restaurant','a restaurant'],['restaurant'],'kitchen school','restorant','restaurant'),
   it('v2','Complete: "A pilot works at an ___."',['airport','an airport'],['airport'],'airplane','air port','airport')])
lesson('vocabulary','A2','Weather words','Describe the weather.',['Uses the right weather adjective','Uses "It is ..." for weather'],
  ['sunny','rainy','windy','cloudy','hot','cold'],['It is + adjective'],['describing weather'],['It is sunny today.'],
  [it('v1','Complete: "Take an umbrella. It is ___ today."',['rainy'],['rainy'],'sunny','rain','rainy'),
   it('v2','Complete: "My hat flew away! It is very ___."',['windy'],['windy'],'cold','wind','windy')])
lesson('vocabulary','B1','Collocations with make and do','Choose make or do in common phrases.',['Chooses make/do correctly','Uses the phrase in a sentence'],
  ['make a mistake','do homework','make a decision','do the shopping','make friends'],['make/do + noun'],['talking about activities'],['I do my homework after dinner.'],
  [it('v1','Complete: "Everyone ___ mistakes when they learn."',['makes','make'],['makes'],'does','make','makes'),
   it('v2','Complete: "I need to ___ a decision about my course."',['make'],['make'],'do','take','make')])
lesson('vocabulary','B1','Describing feelings','Use precise feeling adjectives.',['Chooses an adjective that fits the situation','Explains the feeling in a sentence'],
  ['nervous','proud','disappointed','relieved','confused'],['feel + adjective'],['describing feelings'],['She felt proud of her work.'],
  [it('v1','Complete: "The exam was cancelled, so I felt ___." (happy that a worry is gone)',['relieved'],['relieved'],'disappointed','relief','relieved'),
   it('v2','Complete: "I didn\'t win the prize. I felt ___."',['disappointed'],['disappointed'],'relieved','disapointed','disappointed')])
lesson('vocabulary','B2','Word formation: -tion and -ment','Form nouns from verbs.',['Forms the noun correctly','Uses it in context'],
  ['decide/decision','improve/improvement','inform/information','develop/development'],['noun suffixes -tion, -ment'],['formal description'],['There has been a big improvement in sales.'],
  [it('v1','Complete with a noun from "develop": "The ___ of the city took ten years."',['development'],['development'],'developing','developement','development'),
   it('v2','Complete with a noun from "inform": "Can you give me more ___?"',['information'],['information'],'informations','informing','information')])
lesson('vocabulary','B2','Formal vs informal vocabulary','Choose a formal word for a formal email.',['Replaces the informal word with a formal one','Keeps the meaning'],
  ['get/receive','ask for/request','help/assist','start/commence'],['register'],['formal writing'],['I would like to request a refund.'],
  [it('v1','Make it formal: "We got your letter." → "We ___ your letter."',['received','have received'],['received'],'took','receive','received'),
   it('v2','Make it formal: "Can you help me?" → "Could you ___ me?"',['assist'],['assist'],'helping','support me please','assist')])

# ---------------- READING ----------------
lesson('reading','A1','Reading: Sara\'s day','Read a short text and find information.',['Finds the right detail in the text','Answers in a short phrase'],
  ['morning','school','bus','lunch'],[],['reading for detail'],[],
  [it('r1','Read: "Sara gets up at seven. She goes to school by bus. She has lunch at one." Question: How does Sara go to school?',['by bus','bus','she goes by bus','she goes to school by bus'],['bus'],'by car','bus at seven','by bus'),
   it('r2','Read the same text. Question: When does Sara have lunch?',['at one','one','at one o\'clock','1'],['one'],'at seven','one o clock morning','at one')])
lesson('reading','A1','Reading: a shop sign','Understand a simple notice.',['Finds the time on the notice','Says yes/no correctly'],
  ['open','closed','Monday','Sunday'],[],['reading notices'],[],
  [it('r1','Read the sign: "BAKERY. Open Monday to Saturday, 8 am - 6 pm. Closed on Sunday." Question: Is the bakery open on Sunday?',['no','no it is not','no, it is closed'],['no'],'yes','closed monday','no')
   ,it('r2','Same sign. Question: What time does the bakery close?',['6 pm','at 6','six','6'],['6'],'8 am','at 8 to 6','6 pm')])
lesson('reading','A2','Reading: an email from a friend','Understand the main idea and details of a short email.',['Identifies the main purpose','Finds a specific detail'],
  ['party','invite','Saturday','bring'],[],['reading emails'],[],
  [it('r1','Read: "Hi Omar, I\'m having a party on Saturday at my house. Can you come? Please bring some music. - Ali" Question: Why is Ali writing?',['to invite omar to a party','to invite him','invite to a party','he invites omar to his party'],['invite'],'to ask for music','about Saturday','to invite Omar to his party'),
   it('r2','Same email. Question: What should Omar bring?',['music','some music'],['music'],'food','a party','some music')])
lesson('reading','A2','Reading: a bus timetable','Find information in a timetable.',['Reads the right row','Gives the time'],
  ['leave','arrive','station','minutes'],[],['scanning'],[],
  [it('r1','Read: "Bus 12: leaves City Station 9:15, arrives Park Road 9:40." Question: How long is the trip?',['25 minutes','twenty-five minutes','25'],['25'],'40 minutes','9:40','25 minutes'),
   it('r2','Same timetable. Question: Where does the bus leave from?',['city station','from city station'],['city station'],'park road','the bus station 12','City Station')])
lesson('reading','B1','Reading: a review','Infer the writer\'s opinion.',['Infers the opinion from evidence','Quotes a phrase that shows it'],
  ['plot','boring','recommend','although'],[],['reading for attitude'],[],
  [it('r1','Read: "Although the actors were good, the plot was slow and I nearly fell asleep. I wouldn\'t watch it again." Question: Did the writer enjoy the film? How do you know?',[],['no'],'yes because the actors were good','no','No - the plot was slow and they nearly fell asleep.'),
   it('r2','Same review. Question: What did the writer like?',['the actors','the acting','actors'],['actors'],'the plot','the film','the actors')])
lesson('reading','B1','Reading: instructions','Follow the order of steps.',['Puts steps in order','Finds the step for a detail'],
  ['first','then','finally','plug in'],[],['reading procedures'],[],
  [it('r1','Read: "First, plug in the machine. Then add water. Wait two minutes. Finally, press the green button." Question: What do you do just before pressing the green button?',['wait two minutes','wait 2 minutes','you wait two minutes'],['wait'],'add water','plug in and wait','wait two minutes'),
   it('r2','Same instructions. Question: What is the first step?',['plug in the machine','plug it in'],['plug'],'add water','press button','plug in the machine')])
lesson('reading','B2','Reading: an opinion paragraph','Identify the claim and the supporting reason.',['States the main claim','Identifies the supporting reason'],
  ['claim','evidence','however','therefore'],[],['critical reading'],[],
  [it('r1','Read: "Cities should invest in cycle lanes. Studies show that safe lanes double the number of cyclists, which reduces traffic. However, they cost money." Question: What is the writer\'s main claim?',[],['cycle lanes'],'cycle lanes cost money','cities should have lanes because','Cities should invest in cycle lanes.'),
   it('r2','Same paragraph. Question: What evidence supports the claim?',[],['double'],'they cost money','studies','Studies show safe lanes double the number of cyclists, which reduces traffic.')])
lesson('reading','B2','Reading: implied meaning','Infer meaning not stated directly.',['Makes a reasonable inference','Supports it with the text'],
  ['imply','suggest','tone'],[],['inference'],[],
  [it('r1','Read: "Maya checked her phone for the fifth time, then looked at the door again. The meeting had started twenty minutes ago." Question: How is Maya probably feeling, and why?',[],['worried'],'she is happy','she is waiting','She is probably worried or impatient - someone is late and she keeps checking.'),
   it('r2','Same text. Question: What is Maya probably waiting for?',[],['someone'],'the meeting to finish','phone','Someone who is late for the meeting.')])

# ---------------- WRITING ----------------
lesson('writing','A1','Writing: about me','Write two simple sentences about yourself.',['Writes a complete sentence with a capital letter and full stop','Uses "I am / I have"'],
  ['name','years old','brother','sister'],['I am ...','I have ...'],['personal information'],['I am Lina. I am ten years old.'],
  [it('w1','Write two sentences about you: your name and your age.',[],[],'my name lina. i ten',"I am Lina. I ten years old.",'My name is Lina. I am ten years old.'),
   it('w2','Write one sentence about your family with "I have".',[],[],'i have a brother and sister she name sara','I have one brother','I have one brother and one sister.')])
lesson('writing','A1','Writing: a postcard','Write a very short postcard.',['Starts with "Dear ..." and ends with a name','Says where you are'],
  ['Dear','beach','hot','love'],['I am in ...'],['greetings'],['Dear Mum, I am in Alexandria. It is hot. Love, Nour'],
  [it('w1','Write a 3-line postcard to a friend. Say where you are and the weather.',[],[],'hello. alexandria hot','Dear Sam, I am in Alexandria.','Dear Sam, I am in Alexandria. It is sunny. Love, Nour')
   ,it('w2','Add one sentence about what you do there.',[],[],'i swiming','I swim.','I swim in the sea every day.')])
lesson('writing','A2','Writing: a short message','Write a message to rearrange a meeting.',['Gives a reason','Suggests a new time'],
  ['sorry','can\'t','instead','meet'],['can\'t + verb','Can we ...?'],['apologising','suggesting'],["Sorry, I can't come at 5. Can we meet at 6 instead?"],
  [it('w1','Write a message to a friend: you can\'t meet at 4 today. Say why and suggest a new time.',[],[],'i not come 4. meet 6?',"Sorry, I can't come at 4.","Sorry, I can't meet at 4 because I have a doctor's appointment. Can we meet at 6 instead?"),
   it('w2','Rewrite this to be more polite: "Come at 6."',[],[],'come at 6 please now','Please come at 6.','Could you come at 6, please?')])
lesson('writing','A2','Writing: describing a picture of a park','Describe what people are doing.',['Uses present continuous correctly','Gives at least two details'],
  ['playing','sitting','walking','children','tree'],['is/are + -ing'],['describing'],['Two children are playing football.'],
  [it('w1','Imagine a park. Write two sentences about what people are doing now.',[],[],'children play football. man sit','Children are playing. A man sit on a bench.','Some children are playing football. An old man is sitting under a tree.'),
   it('w2','Add one sentence about the weather in the picture.',[],[],'is sunny day is','It sunny.','It is sunny and warm.')])
lesson('writing','B1','Writing: an opinion paragraph','Write a short paragraph with an opinion and a reason.',['States a clear opinion','Supports it with a reason and an example'],
  ['in my opinion','because','for example','also'],['linking words'],['giving opinions'],['In my opinion, school uniforms are useful because ...'],
  [it('w1','Write 3-4 sentences: Should students have homework every day? Give your opinion and one reason.',[],[],'homework is bad. i dont like','In my opinion homework is not good because students are tired.','In my opinion, daily homework is not necessary because students need time to rest. For example, ...'),
   it('w2','Add a linking word to join these: "I like reading. I don\'t have much time."',[],['but','although'],'and','I like reading, I don\'t have much time.','I like reading, but I don\'t have much time.')])
lesson('writing','B1','Writing: a complaint email','Write a polite complaint.',['Explains the problem clearly','Asks for a specific action'],
  ['order','arrived','damaged','refund','replacement'],['past simple','Could you ...?'],['complaining politely'],['The order arrived damaged. Could you send a replacement?'],
  [it('w1','Write 3 sentences to a shop: your headphones arrived broken. Ask for a solution.',[],[],'headphones broken. give money','My headphones arrived broken. I want money back.','I ordered headphones last week, but they arrived broken. Could you send a replacement or give me a refund?'),
   it('w2','Make this more polite: "Send me my money now."',[],[],'send money please','Please send my money.','Could you please refund my payment?')])
lesson('writing','B2','Writing: a balanced argument','Present both sides of an issue.',['Presents both sides fairly','Uses contrast linkers accurately'],
  ['on the one hand','on the other hand','whereas','nevertheless'],['contrast linkers'],['discursive writing'],['On the one hand, ...; on the other hand, ...'],
  [it('w1','Write 4-5 sentences: advantages and disadvantages of working from home.',[],[],'working home is good and bad. good no traffic','On the one hand you save time. Working from home is bad.','On the one hand, working from home saves travel time. On the other hand, it can feel isolating. Nevertheless, ...'),
   it('w2','Join with a contrast linker: "Online courses are cheap. They need self-discipline."',[],['although','however','but','whereas'],'and','Online courses are cheap, they need self-discipline.','Although online courses are cheap, they need self-discipline.')])
lesson('writing','B2','Writing: a formal summary','Summarise a short text in one sentence.',['Keeps only the main idea','Uses own words'],
  ['summarise','main idea','in short'],['reported language'],['summarising'],[],
  [it('w1','Summarise in one sentence: "The library will close for repairs from 1 to 15 June. Online services will continue. Books can be returned to the box outside."',[],[],'library close june','The library closes in June for repairs.','The library will close for repairs from 1 to 15 June, but online services and the return box will still be available.'),
   it('w2','Rewrite more formally: "Lots of people think it\'s a good idea."',[],[],'many people think good idea','Many people think it is a good idea.','Many people consider it a good idea.')])

# ---------------- CONVERSATION / INTERACTION ----------------
lesson('conversation','A1','Conversation: greetings','Greet someone and answer simple questions.',['Answers the question that was asked','Uses a full simple sentence'],
  ['hello','how are you','fine','thank you','name'],['I am ...','My name is ...'],['greeting'],["Hello! I'm fine, thank you."],
  [it('c1','Answer the question: "Hello! How are you?"',[],[],'my name is ali','fine','I am fine, thank you. And you?'),
   it('c2','Answer: "What is your name?"',[],[],'i am fine','Ali','My name is Ali.')])
lesson('conversation','A1','Conversation: at a café','Order food and drink.',['Uses "I would like / Can I have"','Says please/thank you'],
  ['tea','coffee','juice','sandwich','please'],["Can I have ...?","I'd like ..."],['ordering'],["Can I have a tea, please?"],
  [it('c1','Role-play. Waiter: "Hello, what would you like?" You want an orange juice.',[],[],'orange juice give','Orange juice please.',"Can I have an orange juice, please?"),
   it('c2','Waiter: "Anything to eat?" You want a cheese sandwich.',[],[],'yes eat cheese','A cheese sandwich.',"Yes, I'd like a cheese sandwich, please.")])
lesson('conversation','A2','Conversation: making plans','Suggest an activity and agree a time.',['Makes a suggestion','Responds to the other person'],
  ["Let's ...", 'How about ...?', 'good idea', 'free'],["Let's + verb","How about + -ing"],['suggesting'],["How about going to the cinema on Friday?"],
  [it('c1','Your friend says: "I\'m bored this weekend." Make a suggestion.',[],[],'cinema','Go cinema?',"How about going to the cinema on Saturday?"),
   it('c2','Your friend says: "Good idea! What time?" Answer.',[],[],'saturday','At 5.',"Let's meet at 5 o'clock outside the cinema.")])
lesson('conversation','A2','Conversation: asking for directions','Ask for and follow directions.',['Asks a polite question','Checks understanding'],
  ['excuse me','where is','turn left','straight on','near'],['Where is ...?','Could you ...?'],['asking for directions'],["Excuse me, where is the station?"],
  [it('c1','Ask a stranger politely where the nearest pharmacy is.',[],[],'pharmacy where','Where is pharmacy?',"Excuse me, where is the nearest pharmacy, please?"),
   it('c2','They say: "Go straight on and turn left." Check you understood.',[],[],'ok','Straight and left?',"So I go straight on and then turn left?")])
lesson('conversation','B1','Conversation: giving advice','Give and justify advice.',['Uses should/could/why don\'t you','Gives a reason'],
  ['should','could','why don\'t you','if I were you'],['modal verbs for advice'],['advising'],["If I were you, I'd talk to the teacher."],
  [it('c1','Your friend says: "I always feel tired in class." Give advice with a reason.',[],[],'sleep','You should sleep.',"You should go to bed earlier, because you need about eight hours of sleep."),
   it('c2','They answer: "But I have so much homework!" Respond.',[],[],'ok do homework','Do homework earlier.',"Why don't you start your homework straight after school, so you finish earlier?")])
lesson('conversation','B1','Conversation: agreeing and disagreeing','Agree or disagree politely.',['Uses a polite phrase to agree/disagree','Adds a reason'],
  ['I see your point','I\'m not sure','I agree','actually'],['opinion phrases'],['discussing'],["I see your point, but I think ..."],
  [it('c1','Someone says: "Social media is only bad for teenagers." Disagree politely.',[],[],'no you wrong','I don\'t agree.',"I see your point, but I think it can also help teenagers learn and stay in touch."),
   it('c2','They say: "Maybe you\'re right." Continue the conversation with a question.',[],[],'yes','Yes I am right.',"What do you think schools could do to help students use it well?")])
lesson('conversation','B2','Conversation: negotiating','Negotiate a compromise.',['Proposes a compromise','Uses hedging language'],
  ['would it be possible','how about if','meet halfway','in return'],['conditionals for proposals'],['negotiating'],["Would it be possible to ...? In return, I could ..."],
  [it('c1','Your manager wants the report on Monday. You need until Wednesday. Propose a compromise.',[],[],'i need wednesday','Can I give it Wednesday?',"Would it be possible to send a first draft on Monday and the final version on Wednesday?"),
   it('c2','Manager: "Tuesday at the latest." Respond and close the deal.',[],[],'ok','Okay, Tuesday.',"That works for me - I'll have the final version to you by Tuesday afternoon.")])
lesson('conversation','B2','Conversation: clarifying and paraphrasing','Check meaning by paraphrasing.',['Paraphrases accurately','Asks a clarifying question'],
  ['so what you mean is','do you mean','in other words'],['paraphrasing'],['clarifying'],["So what you're saying is ..."],
  [it('c1','Someone says: "The project is on hold until the budget is approved." Paraphrase to check.',[],[],'project is cancelled','So the project stops?',"So what you mean is the project is paused until they approve the money?"),
   it('c2','Ask a clarifying question about when the budget decision will be made.',[],[],'when','When budget?',"Do you know when they're likely to decide on the budget?")])

# ---------------- GRAMMAR (beyond the 3 v2 topics) ----------------
lesson('grammar','A1','Grammar: there is / there are','Use there is/are with singular and plural.',['Chooses is/are correctly','Uses a/some correctly'],
  ['table','chairs','window','books'],['there is / there are'],['describing a room'],['There is a table. There are two chairs.'],
  [it('g1','Complete: "___ three windows in my room."',['there are','There are'],['are'],'there is','there','There are'),
   it('g2','Complete: "___ a big table in the kitchen."',['there is','There is'],['is'],'there are','is','There is')])
lesson('grammar','A1','Grammar: can for ability','Say what you can and can\'t do.',['Uses can + base verb','Uses can\'t correctly'],
  ['swim','cook','ride a bike','sing'],['can / can\'t + verb'],['talking about ability'],['I can swim. I can\'t sing.'],
  [it('g1','Correct the sentence: "She can swims."',['she can swim','She can swim.'],['swim'],'she cans swim','she can swiming','She can swim.'),
   it('g2','Complete: "I ___ ride a bike. I never learned."',["can't","cannot","can not"],["can't"],'don\'t can','not','can\'t')])
lesson('grammar','A2','Grammar: comparatives','Compare two things.',['Forms the comparative correctly','Uses than'],
  ['bigger','more expensive','better','than'],['comparative adjectives'],['comparing'],['A car is faster than a bike.'],
  [it('g1','Complete: "Cairo is ___ (big) than Luxor."',['bigger'],['bigger'],'more big','biger','bigger'),
   it('g2','Complete: "This phone is ___ (expensive) than that one."',['more expensive'],['more expensive'],'expensiver','most expensive','more expensive')])
lesson('grammar','A2','Grammar: going to for plans','Talk about plans with going to.',['Uses am/is/are going to + verb','Uses a future time expression'],
  ['tomorrow','next week','visit','study'],['be going to'],['talking about plans'],["I'm going to visit my aunt tomorrow."],
  [it('g1','Correct: "I going to study tonight."',["i am going to study tonight","I'm going to study tonight."],['am going to'],'i will going to study','I going study','I am going to study tonight.'),
   it('g2','Complete: "They ___ (play) football next Saturday." (a plan)',['are going to play'],['are going to play'],'going to play','are play','are going to play')])
lesson('grammar','B1','Grammar: first conditional','Talk about likely future results.',['Uses if + present, will + verb','Keeps the result clause in will'],
  ['if','will','unless'],['first conditional'],['predicting'],['If it rains, we will stay home.'],
  [it('g1','Correct: "If it will rain, we stay at home."',['if it rains, we will stay at home','If it rains, we will stay at home.'],['rains','will stay'],'if it rain we will stay','If it rains, we stay at home.','If it rains, we will stay at home.'),
   it('g2','Complete: "If you study, you ___ (pass)."',['will pass',"'ll pass"],['will pass'],'pass','would pass','will pass')])
lesson('grammar','B1','Grammar: used to','Talk about past habits.',['Uses used to + base verb','Uses didn\'t use to correctly'],
  ['used to','didn\'t use to','childhood'],['used to'],['talking about the past'],['I used to play outside every day.'],
  [it('g1','Correct: "When I was a child, I use to play in the street."',['when i was a child, i used to play in the street'],['used to'],'i was used to play','I used play','When I was a child, I used to play in the street.'),
   it('g2','Complete: "I ___ like vegetables, but now I love them." (negative)',["didn't use to","did not use to"],["didn't use to"],"didn't used to",'not used to',"didn't use to")])
lesson('grammar','B2','Grammar: passive voice','Use the passive when the doer is unknown or unimportant.',['Forms the passive correctly','Chooses passive for focus'],
  ['was built','is made','has been','by'],['passive'],['formal description'],['The bridge was built in 1990.'],
  [it('g1','Rewrite in the passive: "Someone stole my bike yesterday."',['my bike was stolen yesterday'],['was stolen'],'my bike stole yesterday','My bike was stole yesterday.','My bike was stolen yesterday.'),
   it('g2','Complete: "The results ___ (announce) next week."',['will be announced','are going to be announced'],['will be announced'],'will announce','will announced','will be announced')])
lesson('grammar','B2','Grammar: second conditional','Talk about unreal situations.',['Uses if + past, would + verb','Uses were with I/he/she'],
  ['would','were','could'],['second conditional'],['hypothesising'],['If I had more time, I would learn Japanese.'],
  [it('g1','Correct: "If I would have money, I will travel."',['if i had money, i would travel'],['had','would travel'],'if i have money i would travel','If I had money, I will travel.','If I had money, I would travel.'),
   it('g2','Complete: "If I ___ (be) you, I would apply."',['were','was'],['were'],'am','would be','were')])
