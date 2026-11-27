(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const symptomResult = $('#symptomResult');
  const labResult = $('#labResult');
  let latestLab = null;
  const symptomGuidance = {
    lowHb: {
      level: 'general', label: ['mababang hemoglobin (Hb) / anemia', 'low hemoglobin (Hb) / anemia'],
      steps: [
        ['Ipa-review ang Hb sa dialysis team; itanong kung kailangan tingnan ang ferritin/TSAT, B12/folate, at posibleng pagdurugo o ibang sanhi.', 'Ask your dialysis team to review Hb and whether ferritin/TSAT, B12/folate, blood loss, or other causes should be checked.'],
        ['Kung pasok sa iyong kidney meal plan, maaaring pag-usapan ang lean na karne, manok, o isda bilang pagkaing may iron. Tanungin ang renal dietitian sa angkop na portion at kung pasok ang beans o fortified cereal sa potassium/phosphorus plan mo.', 'If they fit your kidney meal plan, discuss lean meat, poultry, or fish as iron-containing choices. Ask a renal dietitian about portions and whether beans or fortified cereal fit your potassium/phosphorus plan.'],
        ['Nakakatulong ang pagkain sa nutrisyon ngunit maaaring hindi sapat para maitama ang anemia sa kidney failure. Huwag magsimula ng iron, vitamin, o epoetin maliban kung iniutos ng care team.', 'Food supports nutrition but may not be enough to correct anemia in kidney failure. Do not start iron, vitamins, or epoetin unless your care team directs you.'],
        ['Ipaalam agad ang lumalalang panghihina, hilo, o pagkapagod. Sakit ng dibdib o matinding hirap huminga: tumawag sa 911.', 'Promptly report worsening weakness, dizziness, or fatigue. Chest pain or severe trouble breathing: call 911.']
      ]
    },
    highHb: {
      level: 'general', label: ['mataas na hemoglobin (Hb)', 'high hemoglobin (Hb)'],
      steps: [
        ['Ipa-review ang resulta sa care team; itanong kung kailangan ulitin ang CBC o suriin ang fluid status at iba pang posibleng sanhi.', 'Ask your care team to review the result and whether a repeat CBC, fluid status, or other causes should be assessed.'],
        ['Walang pagkain na ligtas at tiyak na magpapababa ng Hb. Huwag bawasan ang iron/protein, mag-donate ng dugo, o magdagdag ng tubig para “itama” ito nang walang medical advice.', 'There is no food that safely and reliably lowers Hb. Do not restrict iron/protein, donate blood, or add water to “correct” it without medical advice.'],
        ['Sundin ang iyong kasalukuyang fluid limit at gamot plan; tawagan ang dialysis team para sa personal na susunod na hakbang.', 'Follow your current fluid limit and medicine plan; contact your dialysis team for your next steps.'],
        ['Matinding sakit ng ulo, pagbabago ng paningin, sakit ng dibdib, hirap huminga, o biglang panghihina/pamamanhid: humingi agad ng emergency help.', 'Severe headache, vision changes, chest pain, trouble breathing, or sudden weakness/numbness: get emergency help now.']
      ]
    },
    highUric: {
      level: 'general', label: ['mataas na uric acid', 'high uric acid'],
      steps: [
        ['Ang mataas na uric acid lang ay hindi nangangahulugang may gout. Ipa-review ang resulta, sintomas, gamot, at personal na target sa care team.', 'High uric acid alone does not mean you have gout. Ask your care team to review the result, symptoms, medicines, and personal target.'],
        ['Kung bahagi ng iyong renal meal plan, pag-usapan ang pagbabawas ng laman-loob gaya ng atay, malalaking portion ng pulang karne, ilang seafood gaya ng dilis/sardinas/shellfish, beer/alcohol, at matatamis na inuming may asukal/fructose.', 'If compatible with your renal meal plan, discuss limiting organ meats such as liver, large portions of red meat, some seafood such as anchovies/sardines/shellfish, beer/alcohol, and sugary drinks with added sugar/fructose.'],
        ['Huwag tuluyang alisin ang protein o dagdagan ang tubig; sundin ang renal dietitian at fluid limit mo. Huwag ihinto ang niresetang gout medicine o uminom ng ibuprofen/naproxen nang walang payo.', 'Do not eliminate protein or increase water; follow your renal dietitian’s advice and fluid limit. Do not stop prescribed gout medicine or take ibuprofen/naproxen without advice.'],
        ['Kung biglang namula, uminit, sumakit, o namaga ang kasukasuan, makipag-ugnayan sa clinician sa araw ding iyon; kailangan ding maalis sa posibilidad ang impeksiyon.', 'If a joint suddenly becomes red, warm, painful, or swollen, contact a clinician the same day; infection may also need to be ruled out.']
      ]
    },
    lowUric: {
      level: 'general', label: ['mababang uric acid', 'low uric acid'],
      steps: [
        ['Ipa-interpret ang resulta kasama ng iyong history at gamot; karaniwang walang kailangang baguhin sa pagkain dahil lamang mababa ito.', 'Ask your care team to interpret it with your history and medicines; a low result alone usually does not call for a diet change.'],
        ['Huwag dagdagan ang laman-loob, karne, seafood, o alak para itaas ang uric acid.', 'Do not add organ meats, meat, seafood, or alcohol to raise uric acid.'],
        ['Ituloy ang kasalukuyang kidney meal plan at itanong sa clinician kung kailangan ng follow-up.', 'Continue your current kidney meal plan and ask your clinician whether follow-up is needed.']
      ]
    },
    highPotassium: {
      level: 'same-day', label: ['mataas na potassium', 'high potassium'],
      steps: [
        ['Sundin ang instructions ng report o dialysis team; tawagan sila ngayon para sa payo, lalo na kung critical ang flag. Maaaring makaapekto ang potassium sa tibok ng puso.', 'Follow the report or dialysis team’s instructions; call them today for advice, especially if flagged critical. Potassium can affect heart rhythm.'],
        ['Huwag gumamit ng salt substitute o “low-sodium salt” na may potassium chloride. Huwag gumawa ng malawakang pagbabago sa pagkain maliban kung ito ang payo ng renal dietitian.', 'Avoid salt substitutes or “low-sodium salt” containing potassium chloride. Do not make major diet changes unless advised by your renal dietitian.'],
        ['Huwag lumiban o paikliin ang dialysis; huwag baguhin ang gamot o schedule nang kusa.', 'Do not miss or shorten dialysis; do not change medicines or your schedule on your own.'],
        ['Bagong iregular na tibok, matinding panghihina, sakit ng dibdib, o hirap huminga: tumawag sa 911.', 'New irregular heartbeat, severe weakness, chest pain, or trouble breathing: call 911.']
      ]
    },
    lowPotassium: {
      level: 'same-day', label: ['mababang potassium', 'low potassium'],
      steps: [
        ['Ipaalam sa dialysis team ngayon at itanong kung kailangang ulitin o suriin ang resulta at gamot.', 'Tell your dialysis team today and ask whether the result or medicines need review.'],
        ['Huwag dagdagan ang saging, orange, kamatis, o potassium supplement para “itaas” ito nang walang tiyak na payo; maaari itong maging delikado sa HD.', 'Do not add bananas, oranges, tomatoes, or potassium supplements to “raise” it without specific advice; this can be dangerous in HD.'],
        ['Sundin ang dialysis at pagkain plan. Ipaalam agad ang pulikat, pamamanhid, panghihina, o palpitations.', 'Follow your dialysis and meal plan. Promptly report cramps, tingling, weakness, or palpitations.'],
        ['Matinding panghihina, iregular na tibok, pagkahimatay, sakit ng dibdib, o hirap huminga: emergency help ngayon.', 'Severe weakness, irregular heartbeat, fainting, chest pain, or trouble breathing: get emergency help now.']
      ]
    },
    highPhosphorus: {
      level: 'general', label: ['mataas na phosphorus/phosphate', 'high phosphorus/phosphate'],
      steps: [
        ['Suriin ang ingredient list para sa phosphate additives (madalas may “phos” sa pangalan); itanong sa renal dietitian ang praktikal na pamalit.', 'Check ingredient lists for phosphate additives (often containing “phos”); ask a renal dietitian for practical swaps.'],
        ['Kung may phosphate binder ka, inumin lamang ayon sa eksaktong instructions ng team, kabilang ang timing sa pagkain. Huwag magdoble o magbago ng dose.', 'If you take a phosphate binder, use it only as directed by your team, including timing with meals. Do not double or change the dose.'],
        ['Huwag basta alisin ang karne, isda, itlog, o ibang protein; tulungan ka ng dietitian na bawasan ang additives habang nakakakuha pa rin ng sapat na nutrisyon.', 'Do not simply remove meat, fish, eggs, or other protein; a dietitian can help reduce additives while maintaining adequate nutrition.'],
        ['Ipaalam ang resulta sa care team at itanong kung kailangang repasuhin ang trend o treatment plan.', 'Share the result with your care team and ask whether the trend or treatment plan needs review.']
      ]
    },
    lowPhosphorus: {
      level: 'general', label: ['mababang phosphorus/phosphate', 'low phosphorus/phosphate'],
      steps: [
        ['Ipa-review ito sa dialysis team; tingnan ang trend, pagkain, at mga gamot/binder kasama nila.', 'Ask your dialysis team to review it with your trend, food intake, and medicines/binders.'],
        ['Huwag dagdagan ang dairy, nuts, cola, processed foods, o supplement para itaas ito nang walang payo; maaari ring mataas ang mga ito sa potassium, sodium, o fluid.', 'Do not add dairy, nuts, cola, processed foods, or supplements to raise it without advice; these may also be high in potassium, sodium, or fluid.'],
        ['Huwag itigil o baguhin ang phosphate binder o iba pang gamot nang walang instructions.', 'Do not stop or change a phosphate binder or other medicine without instructions.']
      ]
    },
    highCalcium: {
      level: 'general', label: ['mataas na calcium', 'high calcium'],
      steps: [
        ['Ipa-review ito sa dialysis team/clinician kasama ng albumin, phosphorus, at mga kaugnay na gamot.', 'Ask your dialysis team/clinician to review it with albumin, phosphorus, and related medicines.'],
        ['Huwag magsimula o magdagdag ng calcium, vitamin D, antacid, o supplement; huwag ihinto ang niresetang gamot nang walang instructions.', 'Do not start or add calcium, vitamin D, antacids, or supplements; do not stop prescribed medicine without instructions.'],
        ['Ipaalam ang pagduduwal, constipation, matinding uhaw, o pagkalito. Kung biglaan o malubha ang pagkalito/panghihina, humingi agad ng emergency help.', 'Report nausea, constipation, unusual thirst, or confusion. For sudden or severe confusion/weakness, get emergency help now.']
      ]
    },
    lowCalcium: {
      level: 'general', label: ['mababang calcium', 'low calcium'],
      steps: [
        ['Tawagan ang dialysis team/clinician para sa interpretasyon kasama ng albumin at phosphorus; maaaring kailangan ang follow-up.', 'Contact your dialysis team/clinician for interpretation alongside albumin and phosphorus; follow-up may be needed.'],
        ['Huwag uminom ng calcium o vitamin D supplement o magbago ng pagkain/gamot para itama ito nang walang instructions.', 'Do not take calcium or vitamin D supplements or change food/medicines to correct it without instructions.'],
        ['Ipaalam ang pamamanhid o pangingilig sa labi/daliri at pulikat. Seizure, matinding muscle spasm, hirap huminga, o pagkalito: emergency help ngayon.', 'Report numbness or tingling around the lips/fingers and cramps. Seizure, severe muscle spasm, trouble breathing, or confusion: get emergency help now.']
      ]
    },
    lowAlbumin: {
      level: 'general', label: ['mababang albumin', 'low albumin'],
      steps: [
        ['Itanong sa team kung may inflammation, impeksiyon, o ibang dahilan; hindi albumin lang ang sukatan ng nutrisyon.', 'Ask your care team about inflammation, infection, or other causes; albumin alone does not measure nutrition.'],
        ['Kung hirap kumain o pumapayat, humingi ng tulong sa renal dietitian. Pumili lamang ng protein at dagdag na pagkain na pasok sa iyong HD plan.', 'If eating is difficult or you are losing weight, ask a renal dietitian for help. Choose protein and extra foods that fit your HD plan.'],
        ['Huwag basta dagdagan ang protein powder, nutritional drink, o supplement; maaaring marami itong potassium, phosphorus, sodium, o fluid.', 'Do not simply add protein powder, nutrition drinks, or supplements; they may contain significant potassium, phosphorus, sodium, or fluid.'],
        ['Ipaalam kung may sugat na hindi gumagaling, lagnat, o patuloy na kawalan ng gana sa pagkain.', 'Report wounds that are not healing, fever, or ongoing loss of appetite.']
      ]
    },
    highAlbumin: {
      level: 'general', label: ['mataas na albumin', 'high albumin'],
      steps: [
        ['Ipa-review ang resulta sa care team kasama ng iba pang labs at fluid status; maaaring makaapekto ang hydration at iba pang kondisyon sa resulta.', 'Ask your care team to review it with other labs and fluid status; hydration and other conditions can affect the result.'],
        ['Huwag uminom ng dagdag na tubig o magbago ng protein intake para itama ito; sundin ang sarili mong fluid at meal plan.', 'Do not add water or change protein intake to correct it; follow your own fluid and meal plan.'],
        ['Itanong kung kailangan ulitin o suriin ang trend.', 'Ask whether it should be repeated or reviewed as a trend.']
      ]
    },
    highBun: {
      level: 'general', label: ['mataas na BUN/urea', 'high BUN/urea'],
      steps: [
        ['Ipa-review ang resulta sa dialysis team kasama ng schedule, Kt/V o URR, sintomas, at iba pang resulta.', 'Ask your dialysis team to review this with your schedule, Kt/V or URR, symptoms, and other results.'],
        ['Dumalo at tapusin ang dialysis ayon sa schedule. Huwag magdagdag ng session, magbago ng oras, o magbawas ng protein nang kusa.', 'Attend and complete dialysis as scheduled. Do not add sessions, change treatment time, or reduce protein on your own.'],
        ['Kung may na-miss o na-shortened na session, sabihin ito sa team. Ipaalam ang pagduduwal, pangangati, pagkalito, o matinding pagkapagod.', 'Tell your team about any missed or shortened session. Report nausea, itching, confusion, or unusual fatigue.']
      ]
    },
    lowBun: {
      level: 'general', label: ['mababang BUN/urea', 'low BUN/urea'],
      steps: [
        ['Ipa-review ang resulta kasama ng pagkain, timbang, sintomas, at iba pang labs; hindi ito dapat bigyang-kahulugan nang mag-isa.', 'Ask your care team to review it with food intake, weight, symptoms, and other labs; it should not be interpreted alone.'],
        ['Huwag bawasan o dagdagan ang protein batay lamang sa BUN. Humingi ng gabay sa renal dietitian kung hirap kumain o pumapayat.', 'Do not reduce or increase protein based only on BUN. Ask a renal dietitian for help if eating is difficult or you are losing weight.'],
        ['Ituloy ang dialysis at meal plan ayon sa instructions ng team.', 'Continue dialysis and your meal plan as directed by your team.']
      ]
    },
    highGlucose: {
      level: 'general', label: ['mataas na blood sugar/glucose', 'high blood sugar/glucose'],
      steps: [
        ['Kung may diabetes plan ka, sundin iyon sa pag-ulit ng sukat at kung kailan tatawag. Itala ang reading, oras, pagkain, at gamot.', 'If you have a diabetes plan, follow it for rechecking and when to call. Record the reading, time, food, and medicines.'],
        ['Inumin lamang ang gamot ayon sa niresetang schedule; huwag magdagdag ng insulin o dose nang walang instructions.', 'Take medicines only as prescribed; do not add insulin or extra doses without instructions.'],
        ['Tawagan ang care team kung mataas pa rin ayon sa iyong plan, may sakit, o hindi malinaw ang susunod na hakbang. Huwag dagdagan ang tubig kung lampas iyon sa fluid limit.', 'Contact your care team if it remains high by your plan, you feel ill, or next steps are unclear. Do not increase water beyond your fluid limit.'],
        ['Pagsusuka, malalim/mabilis na paghinga, pagkalito, o matinding antok: humingi agad ng emergency help.', 'Vomiting, deep/rapid breathing, confusion, or severe drowsiness: get emergency help now.']
      ]
    },
    lowGlucose: {
      level: 'same-day', label: ['mababang blood sugar/glucose', 'low blood sugar/glucose'],
      steps: [
        ['Kung may diabetes plan ka, sundin ang nakasulat na hakbang para sa low sugar at ulitin ang sukat ayon sa plan. Huwag manghula ng pagkain o dose.', 'If you have a diabetes plan, follow its written low-sugar steps and recheck as directed. Do not guess at food or medicine doses.'],
        ['Kung walang malay, nagse-seizure, o hindi ligtas lumunok, huwag magbigay ng pagkain/inumin sa bibig; tumawag sa 911.', 'If unconscious, having a seizure, or unable to swallow safely, give nothing by mouth; call 911.'],
        ['Kung hindi bumubuti ayon sa iyong plan, bumabalik, o hindi alam ang gagawin, humingi agad ng tulong sa caregiver at tumawag sa care team/911 ayon sa tindi.', 'If it does not improve as directed, returns, or you are unsure what to do, get help from a caregiver and contact your care team/911 depending on severity.']
      ]
    },
    chest: {
      level: 'urgent', label: ['pananakit o bigat ng dibdib', 'chest pain or pressure'],
      steps: [
        ['Tumawag sa 911 ngayon; huwag magmaneho. Magpasama habang naghihintay ng tulong.', 'Call 911 now; do not drive yourself. Have someone stay with you while help is coming.'],
        ['Huwag hintayin kung kusa itong mawawala o maghintay ng sagot mula sa online guide.', 'Do not wait to see if it passes or wait for an online guide response.']
      ]
    },
    breathing: {
      level: 'urgent', label: ['matinding hirap huminga', 'severe trouble breathing'],
      steps: [
        ['Tumawag sa 911 o pumunta agad sa emergency department; huwag magmaneho.', 'Call 911 or go to an emergency department now; do not drive yourself.'],
        ['Umupo nang tuwid kung mas komportable sa paghinga. Huwag piliting uminom ng dagdag na fluid.', 'Sit upright if that makes breathing easier. Do not force extra fluids.']
      ]
    },
    faint: {
      level: 'urgent', label: ['nahimatay, seizure, o biglaang pagkalito', 'fainting, seizure, or sudden confusion'],
      steps: [
        ['Tumawag sa 911 ngayon. Kung seizure, alisin ang mga bagay na maaaring makasakit at huwag pigilan ang galaw o maglagay ng anuman sa bibig.', 'Call 911 now. During a seizure, move nearby hazards away; do not restrain movement or put anything in the person’s mouth.'],
        ['Huwag magbigay ng pagkain o inumin sa taong walang malay o hindi lubos na gising.', 'Do not give food or drink to someone who is unconscious or not fully alert.']
      ]
    },
    bleeding: {
      level: 'urgent', label: ['matinding o hindi humihintong pagdurugo', 'severe or ongoing bleeding'],
      steps: [
        ['Tumawag sa 911 kung matindi ang pagdurugo, nanghihina, o hindi ito tumitigil.', 'Call 911 for heavy bleeding, weakness, or bleeding that will not stop.'],
        ['Habang may tumatawag, idiin nang tuloy-tuloy ang malinis na gauze o tela sa lugar kung ligtas gawin. Huwag balutan nang mahigpit ang buong braso.', 'While someone calls, apply steady pressure with clean gauze or cloth if safe. Do not tightly wrap the whole arm.']
      ]
    },
    dizzy: {
      level: 'same-day', label: ['pagkahilo o pakiramdam na mahihimatay', 'dizziness or feeling faint'],
      steps: [
        ['Umupo o humiga nang ligtas para hindi matumba; kung hirap huminga, umupo nang tuwid. Huwag tumayo o magmaneho habang nahihilo. Magpasama kung maaari.', 'Sit or lie down somewhere safe to prevent a fall; if you are short of breath, sit upright. Do not stand or drive while dizzy. Ask someone to stay with you if possible.'],
        ['Kung may BP monitor at ligtas itong gawin, sukatin ayon sa tamang paraan at itala ang reading, oras, pulso, at kung kailan ito kaugnay ng dialysis.', 'If you have a BP monitor and can use it safely, check it as instructed and record the reading, time, pulse, and relation to dialysis.'],
        ['Tawagan ang dialysis team ngayon kung bago, nagpapatuloy, o kaugnay ng session. Huwag uminom o kumain ng dagdag, o magpalit ng gamot, maliban kung iyon mismo ang nasa iyong care plan.', 'Call your dialysis team today if this is new, ongoing, or related to a session. Do not add fluids or food or change medicines unless your own care plan specifically tells you to.'],
        ['Kung nahimatay, may sakit ng dibdib, hirap huminga, biglang panghihina/pamamanhid, o pagkalito, tumawag sa 911.', 'If you faint, have chest pain, trouble breathing, sudden weakness/numbness, or confusion, call 911.']
      ]
    },
    highBP: {
      level: 'same-day', label: ['mataas na blood pressure ayon sa care plan', 'blood pressure high according to your care plan'],
      steps: [
        ['Umupo nang tahimik at magpahinga. Kung walang emergency na sintomas, ulitin ang sukat ayon sa instructions ng monitor o care team at itala ang resulta.', 'Sit quietly and rest. If there are no emergency symptoms, repeat the measurement as directed by your monitor or care team and record it.'],
        ['Kung nananatiling lampas sa personal mong limit o may nararamdaman, tawagan ang dialysis team/clinician para sa instructions.', 'If it remains above your personal limit or you have symptoms, contact your dialysis team/clinician for instructions.'],
        ['Huwag uminom ng dagdag na dose o magdagdag ng asin, pagkain, o fluid para gamutin ito nang walang instructions.', 'Do not take an extra dose or add salt, food, or fluids to treat it without instructions.'],
        ['Sakit ng dibdib, hirap huminga, biglang pamamanhid/panghihina, pagbabago ng paningin, o matinding sakit ng ulo: tumawag sa 911.', 'Chest pain, trouble breathing, sudden numbness/weakness, vision changes, or a severe headache: call 911.']
      ]
    },
    access: {
      level: 'same-day', label: ['lagnat/panginginig o pagbabago sa dialysis access', 'fever/chills or a change at dialysis access'],
      steps: [
        ['Tawagan ang dialysis unit ngayon at ilarawan ang temperatura at pagbabago. Huwag hintayin ang susunod na session.', 'Call your dialysis unit now and describe your temperature and the change. Do not wait for the next session.'],
        ['Huwag pisilin, kamutin, o lagyan ng cream ang access; sundin ang access-care instructions ng unit.', 'Do not squeeze, scratch, or apply cream to the access; follow your unit’s access-care instructions.'],
        ['Kung mabilis lumala, nalilito, nahihirapang huminga, o matindi ang pakiramdam na may sakit, tumawag sa 911.', 'If rapidly worsening, confused, short of breath, or severely unwell, call 911.']
      ]
    },
    palpitations: {
      level: 'same-day', label: ['bagong iregular o mabilis na tibok ng puso', 'new irregular or racing heartbeat'],
      steps: [
        ['Umupo at iwasan muna ang mabigat na gawain. Tawagan ang dialysis team/clinician ngayon at sabihin kung kailan nagsimula.', 'Sit down and avoid strenuous activity. Contact your dialysis team/clinician now and say when it started.'],
        ['Huwag magdagdag o magpalit ng gamot o supplement. Itala ang pulso kung kaya nang hindi naaantala ang paghingi ng tulong.', 'Do not add or change medicines or supplements. Note your pulse if you can do so without delaying care.'],
        ['May sakit ng dibdib, hirap huminga, nahimatay, o matinding panghihina? Tumawag sa 911.', 'Chest pain, trouble breathing, fainting, or severe weakness? Call 911.']
      ]
    },
    missed: {
      level: 'same-day', label: ['hindi nakadalo o hindi natapos ang dialysis', 'missed or incomplete dialysis'],
      steps: [
        ['Tawagan ang dialysis unit ngayon para sa tiyak na payo kung kailan at paano babalik sa schedule.', 'Call your dialysis unit now for specific instructions on when and how to resume your schedule.'],
        ['Huwag magdoble o mag-extend ng treatment nang kusa. Sundin ang kasalukuyang fluid at pagkain plan habang naghihintay ng payo.', 'Do not double or extend a treatment on your own. Follow your current fluid and food plan while waiting for advice.'],
        ['Kung may hirap huminga, sakit ng dibdib, bagong palpitations, o matinding panghihina, tumawag sa 911.', 'If you have trouble breathing, chest pain, new palpitations, or severe weakness, call 911.']
      ]
    },
    swelling: {
      level: 'same-day', label: ['bagong pamamaga o mabilis na pagbigat', 'new swelling or rapid weight gain'],
      steps: [
        ['Itala ang timbang at kung kailan nagsimula ang pamamaga; tawagan ang dialysis team ngayon para sa payo.', 'Record your weight and when the swelling started; call your dialysis team today for advice.'],
        ['Sundin ang sarili mong fluid at sodium plan. Huwag magbawas o magdagdag ng fluid, asin, o gamot nang kusa.', 'Follow your own fluid and sodium plan. Do not change fluids, salt, or medicines on your own.'],
        ['Kung nahihirapang huminga o may sakit ng dibdib, tumawag sa 911.', 'If you have trouble breathing or chest pain, call 911.']
      ]
    },
    cramps: {
      level: 'same-day', label: ['pulikat habang o pagkatapos ng dialysis', 'cramps during or after dialysis'],
      steps: [
        ['Kung nasa dialysis, sabihin agad sa nurse; huwag galawin ang machine o linya.', 'If you are at dialysis, tell the nurse right away; do not adjust the machine or lines.'],
        ['Kung ligtas at komportable, dahan-dahang iunat ang kalamnan. Tawagan ang team kung matindi o paulit-ulit.', 'If safe and comfortable, gently stretch the muscle. Contact your team if severe or recurring.'],
        ['Huwag uminom ng dagdag na fluid o kumain ng maalat na pagkain para sa pulikat maliban kung bahagi iyon ng iyong care plan.', 'Do not add fluids or eat salty food for cramps unless that is part of your care plan.']
      ]
    },
    nausea: {
      level: 'same-day', label: ['pagduduwal o pagsusuka', 'nausea or vomiting'],
      steps: [
        ['Umupo nang tuwid at magpahinga. Kung kaya mong kumain at pasok sa meal plan, subukan ang kaunting pagkain sa halip na pilitin ang malaking meal.', 'Sit upright and rest. If you can eat and it fits your meal plan, try a small amount rather than forcing a large meal.'],
        ['Tawagan ang care team kung paulit-ulit ang pagsusuka, hindi makainom ng gamot, o nagpapatuloy ang sintomas. Huwag piliting uminom ng dagdag na fluid.', 'Contact your care team for repeated vomiting, inability to keep medicines down, or ongoing symptoms. Do not force extra fluids.'],
        ['Dugo sa suka, matinding sakit, pagkalito, o hirap huminga: humingi agad ng emergency help.', 'Blood in vomit, severe pain, confusion, or trouble breathing: get emergency help now.']
      ]
    },
    itch: {
      level: 'general', label: ['pangangati', 'itching'],
      steps: [
        ['Subukan ang maligamgam, hindi mainit na paligo at fragrance-free moisturizer sa tuyong balat; iwasang kamutin o magasgasan.', 'Try a lukewarm—not hot—shower and fragrance-free moisturizer for dry skin; avoid scratching or breaking the skin.'],
        ['Ipaalam sa team kung nagpapatuloy, nakakaistorbo sa tulog, may pantal/sugat, o bagong nagsimula. Huwag ipagpalagay na phosphorus lang ang sanhi.', 'Tell your team if it persists, disrupts sleep, causes a rash/wound, or is new. Do not assume phosphorus is the only cause.'],
        ['Huwag magsimula ng antihistamine, cream na may gamot, o supplement nang walang payo.', 'Do not start an antihistamine, medicated cream, or supplement without advice.']
      ]
    },
    fatigue: {
      level: 'general', label: ['hindi pangkaraniwang pagkapagod o panghihina', 'unusual tiredness or weakness'],
      steps: [
        ['Itala kung kailan ito nangyayari, gaano katagal, tulog, at kaugnayan sa dialysis; magpahinga at magplano ng magagaang gawain.', 'Note when it happens, how long it lasts, sleep, and relation to dialysis; rest and pace activities.'],
        ['Ipaalam sa team kung bago, lumalala, o nakakaapekto sa gawain. Itanong kung dapat repasuhin ang Hb/iron, nutrisyon, gamot, tulog, o ibang sanhi.', 'Tell your team if it is new, worsening, or affecting daily activities. Ask whether Hb/iron, nutrition, medicines, sleep, or other causes should be reviewed.'],
        ['Bigla o matinding panghihina, sakit ng dibdib, hirap huminga, o pagkalito: humingi agad ng emergency help.', 'Sudden or severe weakness, chest pain, trouble breathing, or confusion: get emergency help now.']
      ]
    },
    headache: {
      level: 'general', label: ['sakit ng ulo', 'headache'],
      steps: [
        ['Magpahinga sa tahimik na lugar. Kung may BP monitor, sukatin ayon sa tamang paraan at itala ang reading.', 'Rest in a quiet place. If you have a BP monitor, check it as instructed and record the reading.'],
        ['Kung bago, paulit-ulit, o hindi nawawala, ipaalam sa dialysis team/clinician. Huwag uminom ng pain reliever nang hindi tinitiyak na ligtas ito sa kidney disease.', 'Tell your dialysis team/clinician if it is new, recurring, or persistent. Do not take a pain reliever without checking that it is safe for kidney disease.'],
        ['Bigla at napakatinding sakit ng ulo, pagbabago ng paningin, pagkalito, o pamamanhid/panghihina: tumawag sa 911.', 'A sudden, extremely severe headache, vision changes, confusion, or numbness/weakness: call 911.']
      ]
    },
    pale: {
      level: 'same-day', label: ['kapansin-pansing pamumutla', 'noticeably pale skin'],
      steps: [
        ['Ipaalam sa care team, lalo na kung bago ito o may pagkapagod, hilo, panghihina, o hirap huminga; itanong kung dapat suriin ang CBC/Hb.', 'Tell your care team, especially if this is new or comes with fatigue, dizziness, weakness, or trouble breathing; ask whether CBC/Hb should be checked.'],
        ['Huwag magsimula ng iron o supplement batay lamang sa pamumutla; maaaring maraming sanhi ito.', 'Do not start iron or supplements based only on paleness; there may be many causes.'],
        ['Sakit ng dibdib, pagkahimatay, o matinding hirap huminga: humingi agad ng emergency help.', 'Chest pain, fainting, or severe trouble breathing: get emergency help now.']
      ]
    },
    joint: {
      level: 'same-day', label: ['biglaang masakit, mapula, mainit, o namamagang kasukasuan', 'sudden painful, red, warm, or swollen joint'],
      steps: [
        ['Makipag-ugnayan sa clinician o dialysis team sa araw ding ito, lalo na kung unang beses; maaaring gout o impeksiyon at kailangan itong masuri.', 'Contact a clinician or your dialysis team the same day, especially for a first episode; it could be gout or infection and needs assessment.'],
        ['Ipahinga at protektahan ang kasukasuan; huwag magsimula ng ibuprofen, naproxen, colchicine, steroid, o ibang gamot nang walang medical advice.', 'Rest and protect the joint; do not start ibuprofen, naproxen, colchicine, steroids, or other medicines without medical advice.'],
        ['Kung may lagnat/panginginig, mabilis na paglala, o matinding panghihina, humingi agad ng urgent medical care.', 'If there is fever/chills, rapid worsening, or severe weakness, seek urgent medical care now.']
      ]
    }
  };
  const labGuidance = {
    hemoglobin: { label: ['Hemoglobin (Hb)', 'Hemoglobin (Hb)'], below: 'lowHb', above: 'highHb' },
    potassium: { label: ['Potassium', 'Potassium'], below: 'lowPotassium', above: 'highPotassium' },
    phosphorus: { label: ['Phosphorus / phosphate', 'Phosphorus / phosphate'], below: 'lowPhosphorus', above: 'highPhosphorus' },
    calcium: { label: ['Calcium', 'Calcium'], below: 'lowCalcium', above: 'highCalcium' },
    albumin: { label: ['Albumin', 'Albumin'], below: 'lowAlbumin', above: 'highAlbumin' },
    uricAcid: { label: ['Uric acid', 'Uric acid'], below: 'lowUric', above: 'highUric' },
    bun: { label: ['BUN / urea', 'BUN / urea'], below: 'lowBun', above: 'highBun' },
    glucose: { label: ['Blood glucose / sugar', 'Blood glucose / sugar'], below: 'lowGlucose', above: 'highGlucose' }
  };
  const rangeLabels = {
    tl: { below: 'Mas mababa sa normal range', above: 'Mas mataas sa normal range' },
    en: { below: 'Below normal range', above: 'Above normal range' }
  };
  const text = {
    tl: {
      symptomMissing: 'Pumili muna ng sintomas para makita ang mga mungkahing hakbang.',
      labMissingTitle: 'Pumili muna ng resulta',
      labMissingText: 'Piliin kung mas mababa o mas mataas sa reference range ang kahit isang resulta sa iyong report.',
      labResultTitle: 'Mga rekomendasyon sa resulta sa lab',
      labResultText: 'Gamitin ang reference range sa sarili mong report. Ipaalam agad sa dialysis team ang abnormal o critical na resulta; maaaring iba ang personal na target nila.',
      emergencyTitle: 'Kailangan ng agarang tulong',
      emergencyText: 'Tumawag sa 911 o pumunta sa pinakamalapit na emergency department ngayon. Huwag maghintay ng sagot mula sa online guide. Kung maaari, magpasama sa isang tao.',
      sameDayTitle: 'Makipag-ugnayan agad sa dialysis team',
      sameDayText: 'Tawagan ang dialysis unit ngayon para sa payo. Kung malubha o mabilis lumalala, pumunta sa emergency department o tumawag sa 911.',
      generalTitle: 'Mga praktikal na hakbang at paalala',
      generalText: 'Sundin ang mga hakbang sa ibaba. Ipaalam sa care team kung nagpapatuloy o lumalala ang sintomas o hindi malinaw ang resulta. Huwag baguhin ang gamot, fluid, pagkain, o dialysis nang walang payo.',
      urgency: { urgent: 'Emergency', 'same-day': 'Tawagan ang care team ngayon', general: 'Ipaalam sa care team' }
    },
    en: {
      symptomMissing: 'Select at least one symptom to see suggested steps.',
      labMissingTitle: 'Select a result first',
      labMissingText: 'Choose whether at least one result on your report is below or above its reference range.',
      labResultTitle: 'Lab result recommendations',
      labResultText: 'Use the reference range on your own report. Promptly tell your dialysis team about abnormal or critical results; their personal targets may differ.',
      emergencyTitle: 'Get emergency help now',
      emergencyText: 'Call 911 or go to the nearest emergency department now. Do not wait for an online guide. If possible, have someone stay with you.',
      sameDayTitle: 'Contact your dialysis team promptly',
      sameDayText: 'Call your dialysis unit today for advice. If symptoms are severe or getting worse quickly, go to the emergency department or call 911.',
      generalTitle: 'Practical steps and reminders',
      generalText: 'Follow the steps below. Tell your care team if symptoms persist or worsen or a result is unclear. Do not change medicines, fluids, diet, or dialysis without advice.',
      urgency: { urgent: 'Emergency', 'same-day': 'Contact your care team today', general: 'Discuss with your care team' }
    }
  };

  function currentLanguage() {
    return document.documentElement.dataset.lang === 'en' ? 'en' : 'tl';
  }

  function setLanguage(language) {
    const selected = language === 'en' ? 'en' : 'tl';
    document.documentElement.dataset.lang = selected;
    document.documentElement.lang = selected;
    try {
      localStorage.setItem('dc-lang-v2', selected);
    } catch (_error) {
      // The guide remains usable when browser storage is unavailable.
    }
    document.querySelectorAll('[data-guide-lang]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.guideLang === selected));
    });
    renderLabResult();
    renderSymptomResult();
    if (!latestSymptoms.length && !latestOtherSymptom && !symptomResult.hidden) {
      $('#symptomResultTitle').textContent = text[selected].symptomMissing;
    }
  }

  function createGuidanceDetail(guidance, index, language, title) {
    const detail = document.createElement('article');
    detail.className = 'symptom-detail';
    const heading = document.createElement('div');
    heading.className = 'symptom-detail-heading';
    const label = document.createElement('h4');
    label.textContent = title || guidance.label[index];
    const urgency = document.createElement('span');
    urgency.className = `urgency-pill urgency-${guidance.level}`;
    urgency.textContent = text[language].urgency[guidance.level];
    heading.append(label, urgency);
    const steps = document.createElement('ul');
    steps.className = 'recommendation-list';
    guidance.steps.forEach((step) => {
      const item = document.createElement('li');
      item.textContent = step[index];
      steps.append(item);
    });
    detail.append(heading, steps);
    return detail;
  }

  function renderLabResult() {
    if (!latestLab) return;
    const language = currentLanguage();
    const index = language === 'tl' ? 0 : 1;
    $('#labResultTitle').textContent = latestLab.length
      ? text[language].labResultTitle
      : text[language].labMissingTitle;
    $('#labResultText').textContent = latestLab.length
      ? text[language].labResultText
      : text[language].labMissingText;
    if (latestLab.length) {
      const urgencyRank = { general: 1, 'same-day': 2, urgent: 3 };
      const details = latestLab.map(({ test, range }) => {
        const lab = labGuidance[test];
        const guidance = symptomGuidance[lab[range]];
        return createGuidanceDetail(
          guidance,
          index,
          language,
          `${lab.label[index]} — ${rangeLabels[language][range]}`
        );
      });
      labResult.dataset.level = latestLab.reduce((highest, { test, range }) => {
        const level = symptomGuidance[labGuidance[test][range]].level;
        return urgencyRank[level] > urgencyRank[highest] ? level : highest;
      }, 'general');
      $('#labResultDetails').replaceChildren(...details);
    } else {
      labResult.dataset.level = 'general';
      $('#labResultDetails').replaceChildren();
    }
    labResult.hidden = false;
  }

  function selectedLabResults() {
    return Array.from(
      document.querySelectorAll('#labForm input[type="checkbox"]:checked'),
      (input) => ({ test: input.dataset.test, range: input.value })
    );
  }

  function refreshLabResultAfterEdit() {
    if (latestLab === null || labResult.hidden) return;
    latestLab = selectedLabResults();
    renderLabResult();
  }

  $('#labForm').addEventListener('change', (event) => {
    const changedInput = event.target;
    if (changedInput.checked) {
      document.querySelectorAll('#labForm input[type="checkbox"][data-test]').forEach((input) => {
        if (input !== changedInput && input.dataset.test === changedInput.dataset.test) {
          input.checked = false;
        }
      });
    }
    refreshLabResultAfterEdit();
  });

  document.querySelectorAll('[data-clear-lab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#labForm input[type="checkbox"][data-test]').forEach((input) => {
        if (input.dataset.test === button.dataset.clearLab) input.checked = false;
      });
      refreshLabResultAfterEdit();
    });
  });

  $('#labForm').addEventListener('submit', (event) => {
    event.preventDefault();
    latestLab = selectedLabResults();
    renderLabResult();
  });

  let latestSymptoms = [];
  let latestOtherSymptom = '';
  function renderSymptomResult() {
    if (!latestSymptoms.length && !latestOtherSymptom) return;
    const language = currentLanguage();
    const index = language === 'tl' ? 0 : 1;
    const urgencyRank = { urgent: 3, 'same-day': 2, general: 1 };
    const selected = latestSymptoms
      .map((symptom) => ({ key: symptom, guidance: symptomGuidance[symptom] }))
      .filter(({ guidance }) => guidance)
      .sort((a, b) => urgencyRank[b.guidance.level] - urgencyRank[a.guidance.level]);
    const level = selected.length ? selected[0].guidance.level : 'general';
    const title = level === 'urgent'
      ? text[language].emergencyTitle
      : level === 'same-day'
        ? text[language].sameDayTitle
        : text[language].generalTitle;
    const message = level === 'urgent'
      ? text[language].emergencyText
      : level === 'same-day'
        ? text[language].sameDayText
        : text[language].generalText;
    symptomResult.dataset.level = level;
    $('#symptomResultTitle').textContent = title;
    $('#symptomResultText').textContent = message;
    const details = selected.map(({ guidance }) =>
      createGuidanceDetail(guidance, index, language)
    );
    if (latestOtherSymptom) {
      const customDetail = document.createElement('article');
      customDetail.className = 'symptom-detail';
      const heading = document.createElement('div');
      heading.className = 'symptom-detail-heading';
      const label = document.createElement('h4');
      label.textContent = language === 'tl'
        ? `Iba pang sintomas: ${latestOtherSymptom}`
        : `Other symptom: ${latestOtherSymptom}`;
      heading.append(label);
      const steps = document.createElement('ul');
      steps.className = 'recommendation-list';
      const customSteps = language === 'tl'
        ? [
            'Itigil muna ang ginagawa at umupo o humiga sa ligtas na lugar. Magpasama; huwag magmaneho kung nanghihina, nahihilo, o masama ang pakiramdam.',
            'Kung ligtas at alam gamitin ang monitor, sukatin at itala ang blood pressure o temperatura. Isulat kung kailan nagsimula at kung kaugnay ng dialysis, pagkain, o gamot.',
            'Sundin ang kasalukuyang fluid, pagkain, gamot, at dialysis plan. Huwag uminom o kumain ng dagdag o magpalit ng gamot batay lamang sa online guide.',
            'Tawagan ang dialysis team ngayon kung bago, nagpapatuloy, lumalala, o nangyari habang/nagkatapos ng dialysis.',
            'Tumawag sa 911 para sa sakit ng dibdib, matinding hirap huminga, pagkahimatay, seizure, biglaang pagkalito o panghihina/pamamanhid, matinding pagdurugo, o mabilis na paglala.'
          ]
        : [
            'Pause activity and sit or lie somewhere safe. Ask someone to stay with you; do not drive if weak, dizzy, or unwell.',
            'If safe and you know how to use the monitor, check and record blood pressure or temperature. Note when it started and any relation to dialysis, food, or medicine.',
            'Follow your current fluid, food, medicine, and dialysis plan. Do not add food or fluids or change medicines based only on an online guide.',
            'Call your dialysis team today if it is new, persistent, worsening, or happened during/after dialysis.',
            'Call 911 for chest pain, severe trouble breathing, fainting, seizure, sudden confusion or weakness/numbness, severe bleeding, or rapid worsening.'
          ];
      customSteps.forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
      });
      customDetail.append(heading, steps);
      details.push(customDetail);
    }
    $('#symptomDetails').replaceChildren(...details);
    symptomResult.hidden = false;
  }

  $('#symptomForm').addEventListener('submit', (event) => {
    event.preventDefault();
    latestSymptoms = Array.from(
      document.querySelectorAll('input[name="symptom"]:checked'),
      (input) => input.value
    );
    latestOtherSymptom = $('#otherSymptom').value.trim();
    if (!latestSymptoms.length && !latestOtherSymptom) {
      symptomResult.dataset.level = 'general';
      $('#symptomResultTitle').textContent = text[currentLanguage()].symptomMissing;
      $('#symptomResultText').textContent = '';
      $('#symptomDetails').replaceChildren();
      symptomResult.hidden = false;
      return;
    }
    renderSymptomResult();
  });

  document.querySelectorAll('[data-guide-lang]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.guideLang));
  });
  const printGuide = $('#printGuide');
  if (printGuide) printGuide.addEventListener('click', () => window.print());

  const menuToggle = $('#menuToggle');
  const mobileMenu = $('#mobileMenu');
  if (menuToggle && mobileMenu) {
    const closeMenu = () => {
      mobileMenu.hidden = true;
      menuToggle.setAttribute('aria-expanded', 'false');
    };
    menuToggle.addEventListener('click', () => {
      const open = mobileMenu.hidden;
      mobileMenu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
    });
    mobileMenu.addEventListener('click', (event) => {
      if (event.target.closest('a, [data-guide-lang]')) closeMenu();
    });
    document.addEventListener('click', (event) => {
      if (!mobileMenu.hidden && !mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !mobileMenu.hidden) {
        closeMenu();
        menuToggle.focus();
      }
    });
  }
  let initialLanguage = 'tl';
  try {
    initialLanguage = localStorage.getItem('dc-lang-v2') || 'tl';
  } catch (_error) {
    // The guide defaults to Tagalog when browser storage is unavailable.
  }
  setLanguage(initialLanguage);

  window.addEventListener('pagehide', () => {
    $('#labForm').reset();
    $('#symptomForm').reset();
    latestLab = null;
    latestSymptoms = [];
    latestOtherSymptom = '';
    labResult.hidden = true;
    symptomResult.hidden = true;
  });
})();
