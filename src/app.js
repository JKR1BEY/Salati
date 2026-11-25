(() => {
  'use strict';

  const api = window.salati;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const RING_CIRCUMFERENCE = 2 * Math.PI * 104;

  const PRAYERS = [
    { key: 'fajr', name: 'الفجر' },
    { key: 'sunrise', name: 'الشروق' },
    { key: 'dhuhr', name: 'الظهر' },
    { key: 'asr', name: 'العصر' },
    { key: 'maghrib', name: 'المغرب' },
    { key: 'isha', name: 'العشاء' }
  ];
  const PRAYER_NAMES = Object.fromEntries(PRAYERS.map((p) => [p.key, p.name]));

  const THEME_META = {
    dark: { icon: '#i-moon', label: 'الوضع الداكن' },
    gold: { icon: '#i-sparkle', label: 'الثيم الذهبي' },
    light: { icon: '#i-sun', label: 'الوضع الفاتح' }
  };

  // خيارات قائمة المظهر في الشريط الجانبي: الثيمات الثلاثة المعرّفة فقط.
  const THEME_OPTIONS = [
    { value: 'dark', label: THEME_META.dark.label, icon: THEME_META.dark.icon },
    { value: 'gold', label: THEME_META.gold.label, icon: THEME_META.gold.icon },
    { value: 'light', label: THEME_META.light.label, icon: THEME_META.light.icon }
  ];

  // وقت الصلاة يحدّد عنوان البطاقة فقط؛ أما النصوص فتُؤخذ من مكتبة مستقلة
  // غير مقيدة بصلاة معيّنة ولا بموضوع الأذان، ويمكن تصفّحها بلا حدّ لكل وقت.
  const SPIRITUAL_PERIODS = {
    fajr: 'الفجر · وقت السَّحَر',
    sunrise: 'الشروق · طُلُوع الشمس',
    dhuhr: 'الظهر · أوّل النهار',
    asr: 'العصر · قبل الغروب',
    maghrib: 'المغرب · بعد غياب الشمس',
    isha: 'العشاء · سواد الليل'
  };

  // مكتبة آيات صحيحة مختارة بسورها وآياتها، بخط عربي مشكّل متوافق مع الواجهة.
  const SPIRITUAL_VERSES = [
    { text: 'قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ', ref: 'سورة الإخلاص ١١٢: ١–٤' },
    { text: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كُتَابًا مَّوْقُوتًا', ref: 'سورة النساء ٤: ١٠٣' },
    { text: 'حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ وَقُومُوا لِلَّهِ قَانِتِينَ', ref: 'سورة البقرة ٢: ٢٣٨' },
    { text: 'وَالْعَصْرِ ۝ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ ۝ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ', ref: 'سورة العصر ١٠٣: ١–٣' },
    { text: 'وَقُل رَّبِّ زِدْنِي عِلْمًا', ref: 'سورة طه ٢٠: ١١٤' },
    { text: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ۝ إِنَّ مَعَ الْعُسْرِ يُسْرًا', ref: 'سورة الشرح ٩٤: ٥–٦' },
    { text: 'فَاذْكُرُونِي أَذْكُرْكُمْ', ref: 'سورة البقرة ٢: ١٥٢' },
    { text: 'وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ', ref: 'سورة البقرة ٢: ١٨٦' },
    { text: 'فَسُبْحَانَ اللَّهِ حِينَ تُمْسُونَ وَحِينَ تُصْبِحُونَ ۝ وَلَهُ الْحَمْدُ فِي السَّمَاوَاتِ وَالْأَرْضِ وَعَشِيًّا وَحِينَ تُظْهِرُونَ', ref: 'سورة الروم ٣٠: ١٧–١٨' },
    { text: 'سُبْحَانَ رَبِّكَ رَبِّ الْعِزَّةِ عَمَّا يَصِفُونَ ۝ وَسَلَامٌ عَلَى الْمُرْسَلِينَ ۝ وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', ref: 'سورة الصافات ٣٧: ١٨٠–١٨٢' },
    { text: 'وَعَلَى اللَّهِ فَتَوَكَّلُوا إِن كُنتُم مُّؤْمِنِينَ', ref: 'سورة المائدة ٥: ٢٣' },
    { text: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا', ref: 'سورة الطلاق ٦٥: ٢' },
    { text: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مِنْ أَمْرِهِ يُسْرًا', ref: 'سورة الطلاق ٦٥: ٥' },
    { text: 'إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ وَيُحِبُّ الْمُتَطَهِّرِينَ', ref: 'سورة البقرة ٢: ٢٢٢' },
    { text: 'قُلْ يَا عِبَادِي الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا', ref: 'سورة الزمر ٣٩: ٥٣' },
    { text: 'وَرَحْمَتِي وَسِعَتْ كُلَّ شَيْءٍ', ref: 'سورة الأعراف ٧: ١٥٦' },
    { text: 'إِنَّمَا يُوَفَّى الصَّابِرُونَ أَجْرَهُم بِغَيْرِ حِسَابٍ', ref: 'سورة الزمر ٣٩: ١٠' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', ref: 'سورة البقرة ٢: ١٥٣' },
    { text: 'وَالصَّابِرِينَ وَالصَّادِقِينَ وَالْقَانِتِينَ وَالْمُنفِقِينَ وَالْمُسْتَغْفِرِينَ بِالْأَسْحَارِ', ref: 'سورة آل عمران ٣: ١٧' },
    { text: 'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ', ref: 'سورة الفلق ١١٣: ١–٥' },
    { text: 'قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَهِ النَّاسِ ۝ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ', ref: 'سورة الناس ١١٤: ١–٦' },
    { text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ', ref: 'سورة البقرة ٢: ٢٥٥' },
    { text: 'أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ وَقُرْآنَ الْفَجْرِ ۖ إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا', ref: 'سورة الإسراء ١٧: ٧٨' },
    { text: 'وَمِنَ اللَّيْلِ فَسَبِّحْهُ وَأَطْرَافَ النَّهَارِ لَعَلَّكَ تَرْضَى', ref: 'سورة طه ٢٠: ١٣٠' },
    { text: 'قُمِ اللَّيْلَ إِلَّا قَلِيلًا', ref: 'سورة المزمل ٧٣: ٢' },
    { text: 'أَمَّنَا هُوَ قَانِتٌ آنَاءَ اللَّيْلِ سَاجِدًا وَقَائِمًا يَحْذَرُ الْآخِرَةَ', ref: 'سورة الزمر ٣٩: ٩' },
    { text: 'إِنَّ رَبَّكَ يَعْلَمُ أَنَّكَ تَقُومُ أَدْنَىٰ مِّن ثُلُثَيِ اللَّيْلِ', ref: 'سورة المزمل ٧٣: ٢٠' },
    { text: 'وَاللَّيْلِ إِذَا أَدْبَرَ ۝ وَالصُّبْحِ إِذَا أَسْفَرَ', ref: 'سورة المدثر ٧٤: ٣٣–٣٤' },
    { text: 'وَأَشْرَقَتِ الْأَرْضُ بِنُورِ رَبِّهَا وَوُضِعَ الْكِتَابُ', ref: 'سورة الزمر ٣٩: ٦٩' },
    { text: 'يَا بَنِي آدَمَ خُذُوا زِينَتَكُمْ عِندَ كُلِّ مَسْجِدٍ', ref: 'سورة الأعراف ٧: ٣١' },
    { text: 'لَقَدْ أَفْلَحَ الْمُؤْمِنُونَ ۝ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ', ref: 'سورة المؤمنون ٢٣: ١–٢' },
    { text: 'وَالَّذِينَ هُمْ عَلَىٰ صَلَوَاتِهِمْ يُحَافِظُونَ', ref: 'سورة المؤمنون ٢٣: ٩' },
    { text: 'يَا أَيُّهَا النَّاسُ اعْبُدُوا رَبَّكُمُ الَّذِي خَلَقَكُمْ', ref: 'سورة البقرة ٢: ٢١' },
    { text: 'مَا أَصَابَ مِن مُّصِيبَةٍ إِلَّا بِإِذْنِ اللَّهِ ۚ وَمَن يُؤْمِن بِاللَّهِ يَهْدِ قَلْبَهُ', ref: 'سورة التغابن ٦٤: ١١' },
    { text: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ', ref: 'سورة البقرة ٢: ١٥٦' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا كُونُوا قَوَّامِينَ لِلَّهِ شُهَدَاءَ بِالْقِسْطِ', ref: 'سورة المائدة ٥: ٨' },
    { text: 'إِنَّ اللَّهَ يَأْمُرُكُمْ أَن تُؤَدُّوا الْأَمَانَاتِ إِلَىٰ أَهْلِهَا', ref: 'سورة النساء ٤: ٥٨' },
    { text: 'وَقُولُوا لِلنَّاسِ حُسْنًا', ref: 'سورة البقرة ٢: ٨٣' },
    { text: 'إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ', ref: 'سورة النحل ١٦: ٩٠' },
    { text: 'وَأَحْسِنُوا ۛ إِنَّ اللَّهَ يُحِبُّ الْمُحْسِنِينَ', ref: 'سورة البقرة ٢: ١٩٥' },
    { text: 'إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ', ref: 'سورة الحجرات ٤٩: ١٠' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا لَا يَسْخَرْ قَوْمٌ مِّن قَوْمٍ', ref: 'سورة الحجرات ٤٩: ١١' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اجْتَنِبُوا كَثِيرًا مِّنَ الظَّنِّ', ref: 'سورة الحجرات ٤٩: ١٢' },
    { text: 'وَلَا يَغْتَب بَّعْضُكُم بَعْضًا', ref: 'سورة الحجرات ٤٩: ١٢' },
    { text: 'إِنَّ اللَّهَ مَعَ الَّذِينَ اتَّقَوا وَّالَّذِينَ هُم مُّحْسِنُونَ', ref: 'سورة النحل ١٦: ١٢٨' },
    { text: 'اللَّهُ وَلِيُّ الَّذِينَ آمَنُوا يُخْرِجُهُم مِّنَ الظُّلُمَاتِ إِلَى النُّورِ', ref: 'سورة البقرة ٢: ٢٥٧' },
    { text: 'قَدْ نَرَىٰ تَقَلُّبَ وَجْهِكَ فِي السَّمَاءِ ۖ فَلَنُوَلِّيَنَّكَ قِبْلَةً تَرْضَاهَا', ref: 'سورة البقرة ٢: ١٤٤' },
    { text: 'وَلِلَّهِ عَلَى النَّاسِ حِجُّ الْبَيْتِ مَنِ اسْتَطَاعَ إِلَيْهِ سَبِيلًا', ref: 'سورة آل عمران ٣: ٩٧' },
    { text: 'لَّا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', ref: 'سورة البقرة ٢: ٢٨٦' },
    { text: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', ref: 'سورة البقرة ٢: ٢٠١' },
    { text: 'كُلُّ مَنْ عَلَيْهَا فَانٍ ۝ وَيَبْقَىٰ وَجْهُ رَبِّكَ ذُو الْجَلَالِ وَالْإِكْرَامِ', ref: 'سورة الرحمن ٥٥: ٢٦–٢٧' },
    { text: 'خَلَقَ الْإِنسَانَ ۝ عَلَّمَهُ الْبَيَانَ', ref: 'سورة الرحمن ٥٥: ٣–٤' },
    { text: 'وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ', ref: 'سورة القمر ٥٤: ١٧' },
    { text: 'بَلْ هُوَ قُرْآنٌ مَّجِيدٌ ۝ فِي لَوْحٍ مَّحْفُوظٍ', ref: 'سورة البروج ٨٥: ٢١–٢٢' },
    { text: 'إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ', ref: 'سورة الحجر ١٥: ٩' },
    { text: 'تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', ref: 'سورة الملك ٦٧: ١' },
    { text: 'سَبِّحِ اسْمَ رَبِّكَ الْأَعْلَى', ref: 'سورة الأعلى ٨٧: ١' },
    { text: 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ', ref: 'سورة العلق ٩٦: ١' },
    { text: 'وَالضُّحَى ۝ وَاللَّيْلِ إِذَا سَجَى', ref: 'سورة الضحى ٩٣: ١–٢' },
    { text: 'وَالتِّينِ وَالزَّيْتُونِ ۝ وَطُورِ سِينِينَ', ref: 'سورة التين ٩٥: ١–٢' },
    { text: 'إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ ۝ وَرَأَيْتَ النَّاسَ يَدْخُلُونَ فِي دِينِ اللَّهِ أَفْوَاجًا', ref: 'سورة النصر ١١٠: ١–٢' },
    { text: 'فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًا يَرَهُ ۝ وَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ شَرًّا يَرَهُ', ref: 'سورة الزلزلة ٩٩: ٧–٨' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اذْكُرُوا اللَّهَ ذِكْرًا كَثِيرًا', ref: 'سورة الأحزاب ٣٣: ٤١' },
    { text: 'الَّذِينَ يَذْكُرُونَ اللَّهَ قِيَامًا وَقُعُودًا وَعَلَىٰ جُنُوبِهِمْ', ref: 'سورة آل عمران ٣: ١٩١' },
    { text: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ', ref: 'سورة النمل ٢٧: ١٩' },
    { text: 'إِذْ أَوَى الْفِتْيَةُ إِلَى الْكَهْفِ فَقَالُوا رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً', ref: 'سورة الكهف ١٨: ١٠' },
    { text: 'قَالَ إِنِّي عَبْدُ اللَّهِ آتَانِي الْكِتَابَ', ref: 'سورة مريم ١٩: ٣٠' },
    { text: 'يَا أَيُّهَا الْإِنسَانُ إِنَّكَ كَادِحٌ إِلَىٰ رَبِّكَ كَدْحًا فَمُلَاقِيهِ', ref: 'سورة الانشقاق ٨٤: ٦' },
    { text: 'إِنَّا فَتَحْنَا لَكَ فَتْحًا مُّبِينًا', ref: 'سورة الفتح ٤٨: ١' },
    { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا نُودِيَ لِلصَّلَاةِ مِن يَوْمِ الْجُمُعَةِ فَاسْعَوْا إِلَىٰ ذِكْرِ اللَّهِ وَذَرُوا الْبَيْعَ ۚ ذَٰلِكُمْ خَيْرٌ لَّكُمْ إِن كُنتُمْ تَعْلَمُونَ', ref: 'سورة الجمعة ٦٢: ١٠' },
    { text: 'إِنَّ فِي خَلْقِ السَّمَاوَاتِ وَالْأَرْضِ وَاخْتِلَافِ اللَّيْلِ وَالنَّهَارِ لَآيَاتٍ لِّأُولِي الْأَلْبَابِ', ref: 'سورة آل عمران ٣: ١٩٠' },
    { text: 'فَأَمَّا الْيَتِيمَ فَلَا قَهَرْ ۝ وَأَمَّا السَّائِلَ فَلَا نَهَرْ ۝ وَأَمَّا بِنِعْمَةِ رَبِّكَ فَحَدِّثْ', ref: 'سورة الضحى ٩٣: ٩–١١' },
    { text: 'وَلَا تَقُولُوا لِمَا تَصِفُ أَلْسِنَتُكُمُ الْكَذَبَ هَٰذَا حَلَالٌ وَهَٰذَا حَرَامٌ', ref: 'سورة النحل ١٦: ١١٦' },
    { text: 'وَقَدْ خَابَ مَن دَسَّاها', ref: 'سورة الشمس ٩١: ١٠' },
    { text: 'وَنَفْسٍ وَمَا سَوَّاها ۝ فَأَلْهَمَهَا فُجُورَهَا وَتَقْوَاهَا', ref: 'سورة الشمس ٩١: ٧–٨' },
    { text: 'إِنَّ الَّذِينَ يَتْلُونَ كِتَابَ اللَّهِ وَأَقَامُوا الصَّلَاةَ وَأَنفَقُوا مِمَّا رَزَقْنَاهُمْ سِرًّا وَعَلَانِيَةً يَرْجُونَ تِجَارَةً لَّن تَبُورَ', ref: 'سورة فاطر ٣٥: ٢٩' },
    { text: 'لَّقَدْ رَضِيَ اللَّهُ عَنِ الْمُؤْمِنِينَ إِذْ يُبَايِعُونَكَ تَحْتَ الشَّجَرَةِ', ref: 'سورة الفتح ٤٨: ١٨' },
    { text: 'سَلَامٌ عَلَيْكُمْ طِبْتُمْ فَادْخُلُوهَا خَالِدِينَ', ref: 'سورة الزمر ٣٩: ٧٣' },
    { text: 'جَنَّاتُ عَدْنٍ يَدْخُلُونَهَا وَمَن صَلَحَ مِنْ آبَائِهِمْ وَأَزْوَاجِهِمْ وَذُرِّيَّاتِهِمْ', ref: 'سورة الرعد ١٣: ٢٣' }
  ];

  // مكتبة أحاديث صحيحة أو معروفة، مع مصدرها وراويها لتسهيل الرجوع إليها.
  const SPIRITUAL_HADITHS = [
    { text: 'بُنِيَ الْإِسْلَامُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَإِقَامِ الصَّلَاةِ، وَإِيتَاءِ الزَّكَاةِ، وَالْحَجِّ، وَصَوْمِ رَمَضَانَ', ref: 'متفق عليه عن عبد الله بن عمر رضي الله عنهما' },
    { text: 'أَيُّ الْعَمَلِ أَحَبُّ إِلَى اللَّهِ؟ قَالَ: الصَّلَاةُ لِوَقْتِهَا، ثُمَّ بِرُّ الْوَالِدَيْنِ، ثُمَّ الْجِهَادُ فِي سَبِيلِ اللَّهِ', ref: 'متفق عليه عن عبد الله بن مسعود رضي الله عنه' },
    { text: 'قَالَ رَسُولُ اللَّهِ ﷺ: الْإِيمَانُ أَنْ تُؤْمِنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ وَالْيَوْمِ الْآخِرِ، وَتُؤْمِنَ بِالْقَدَرِ خَيْرِهِ وَشَرِّهِ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'مَن كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'الْمُسْلِمُ مَن سَلِمَ الْمُسْلِمُونَ مِن لِّسَانِهِ وَيَدِهِ', ref: 'متفق عليه عن عبد الله بن عمرو رضي الله عنهما' },
    { text: 'خَيْرُكُمْ مَن تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ', ref: 'رواه البخاري عن عثمان بن عفان رضي الله عنه' },
    { text: 'الدِّينُ النَّصِيحَةُ', ref: 'رواه مسلم عن تميم الداري رضي الله عنه' },
    { text: 'الْإِيمَانُ بَضْعٌ وَسِتُّونَ شُعْبَةً، وَالْحَيَاءُ شُعْبَةٌ مِنَ الْإِيمَانِ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ', ref: 'متفق عليه عن أنس بن مالك رضي الله عنه' },
    { text: 'مَن ذَكَرَ اللَّهَ فِي نَفْسِهِ ذَكَرَهُ اللَّهُ فِي نَفْسِهِ، وَمَن ذَكَرَهُ فِي مَلَأٍ ذَكَرَهُ اللَّهُ فِي مَلَأٍ خَيْرٍ مِنْهُم', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'كَلِمَتَانِ خَفِيفَتَانِ عَلَى اللِّسَانِ، ثَقِيلَتَانِ فِي الْمِيزَانِ، حَبِيبَتَانِ إِلَى الرَّحْمَنِ: سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', ref: 'رواه أبو داود عن عبد الله بن مسعود رضي الله عنه' },
    { text: 'مَن قَالَ: سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، مِائَةَ مَرَّةٍ، حُطَّتْ خَطَايَاهُ وَإِن كَانَتْ مِثْلَ زَبَدِ الْبَحْرِ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'أَفْضَلُ الذِّكْرِ لَا إِلَهَ إِلَّا اللَّهُ', ref: 'رواه الترمذي عن جابر بن سمرة رضي الله عنه' },
    { text: 'مَن قَالَ: لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، مِائَةَ مَرَّةٍ، كَانَتْ لَهُ عَدْلَ عَشَرَةِ رِقَابٍ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'إِنَّمَا الصَّبْرُ عِنْدَ الصَّدْمَةِ الْأُولَى', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'عَجَبًا لِرَجُلٍ مُؤْمِنٍ، إِنَّ أَمْرَهُ كُلَّهُ لَهُ خَيْرٌ، وَلَيْسَ ذَٰلِكَ لِأَحَدٍ إِلَّا لِلْمُؤْمِنِ', ref: 'رواه مسلم عن صهيب الرومي رضي الله عنه' },
    { text: 'لَا يَزَالُ الْبَلَاءُ بِالْمُؤْمِنِ حَتَّى يَمْشِيَ عَلَى الْأَرْضِ وَمَا عَلَيْهِ خَطِيئَةٌ', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'إِذَا أَحَبَّ اللَّهُ عَبْدًا ابْتَلَاهُ', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'كُلُّ بَنِي آدَمَ خَطَّاءٌ، وَخَيْرُ الْخَطَّاءِينَ التَّوَّابُونَ', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'يَا أَيُّهَا النَّاسُ، تُوبُوا إِلَى اللَّهِ فَإِنِّي أَتُوبُ إِلَيْهِ فِي الْيَوْمِ مِائَةَ مَرَّةٍ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'مَن لَا يَرْحَمُ النَّاسَ لَا يَرْحَمُهُ اللَّهُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'الرُّحَمَاءُ يَرْحَمُهُمُ الرَّحْمَنُ، ارْحَمُوا مَن فِي الْأَرْضِ يَرْحَمْكُم مَن فِي السَّمَاءِ', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'لَوْ تَوَكَّلْتُمْ عَلَى اللَّهِ حَقَّ تَوَكُّلِهِ لَرَزَقَكُمْ كَمَا يَرْزُقُ الطَّيْرَ تَغْدُو خِيَاصًا وَتَرُوحُ بِطَانًا', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ', ref: 'رواه البخاري عن أبي هريرة رضي الله عنه' },
    { text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى', ref: 'رواه مسلم عن أنس بن مالك رضي الله عنه' },
    { text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا', ref: 'رواه مسلم عن أم سلمة رضي الله عنها' },
    { text: 'مَن يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ', ref: 'متفق عليه عن معاوية بن أبي سفيان رضي الله عنه' },
    { text: 'مَن كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيُكْرِمْ ضَيْفَهُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'مَن كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيَصِلْ رَحِمَهُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'مَن كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلَا يُؤْذِ جَارَهُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ لَكَ صَدَقَةٌ', ref: 'رواه الترمذي عن أبي ذر الغفاري رضي الله عنه' },
    { text: 'مَن سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'حَقُّ الْمُسْلِمِ عَلَى الْمُسْلِمِ خَمْسٌ: رَدُّ السَّلَامِ، وَعِيَادَةُ الْمَرِيضِ، وَاتِّبَاعُ الْجَنَازَةِ، وَإِجَابَةُ الدَّعْوَةِ، وَتَشْمِيتُ الْعَاطِسِ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'إِذَا عَطَسَ أَحَدُكُمْ فَلْيَقُلْ: الْحَمْدُ لِلَّهِ، وَلْيَقُلْ لَهُ مَنْ عِنْدَهُ: يَرْحَمُكَ اللَّهُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'لَا يَجِلُّ لِمُسْلِمٍ أَنْ يَهْجُرَ أَخَاهُ فَوْقَ ثَلَاثِ لَيَالٍ', ref: 'متفق عليه عن أنس بن مالك رضي الله عنه' },
    { text: 'إِنَّ مِنْ أَحَبِّكُمْ إِلَيَّ وَأَقْرَبِكُمْ مِنِّي مَجْلِسًا يَوْمَ الْقِيَامَةِ أَحَاسِنَكُمْ أَخْلَاقًا', ref: 'رواه الترمذي عن جابر بن عبد الله رضي الله عنهما' },
    { text: 'أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا', ref: 'رواه الترمذي عن أبي هريرة رضي الله عنه' },
    { text: 'اسْتَوْصُوا بِالنِّسَاءِ خَيْرًا', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'صَلُّوا كَمَا رَأَيْتُمُونِي أُصَلِّي', ref: 'رواه البخاري عن جابر بن سمرة رضي الله عنه' },
    { text: 'أَوَّلُ مَا يُحَاسَبُ بِهِ الْعَبْدُ يَوْمَ الْقِيَامَةِ الصَّلَاةُ', ref: 'رواه الترمذي عن أبي هريرة رضي الله عنه' },
    { text: 'الصَّلَوَاتُ الْخَمْسُ، وَالْجُمُعَةُ إِلَى الْجُمُعَةِ، وَرَمَضَانُ إِلَى رَمَضَانَ، مُكَفِّرَاتٌ لِمَا بَيْنَهُنَّ إِذَا اجْتُنِبَتِ الْكَبَائِرُ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'مَا بَيْنَ الْأَذَانِ وَالْإِقَامَةِ صَلَاةٌ، فَمَنْ شَاءَ فَلْيُصَلِّ', ref: 'متفق عليه عن أنس بن مالك رضي الله عنه' },
    { text: 'إِذَا نُودِيَ لِلصَّلَاةِ أَدْبَرَ الشَّيْطَانُ وَلَهُ ضُرَاطٌ حَتَّى يَقْضِيَ الصَّلَاةَ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'مَن نَامَ عَنْ صَلَاةٍ أَوْ نَسِيهَا فَلْيُصَلِّهَا إِذَا ذَكَرَهَا، لَا كَفَّارَةَ لَهَا إِلَّا ذَلِكَ', ref: 'رواه مسلم عن أنس بن مالك رضي الله عنه' },
    { text: 'الْعَهْدُ الَّذِي بَيْنَنَا وَبَيْنَهُمُ الصَّلَاةُ، فَمَنْ تَرَكَهَا فَقَدْ كَفَرَ', ref: 'رواه الترمذي عن بريدة بن الحصيب رضي الله عنه' },
    { text: 'مَا زَالَ الْعَبْدُ فِي صَلَاةٍ مَا دَامَ فِي مَسْجِدِهِ يَنْتَظِرُ الصَّلَاةَ، يَقُولُ: اللَّهُمَّ اغْفِرْ لِي، اللَّهُمَّ ارْحَمْنِي', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'إِذَا أُقِيمَتِ الصَّلَاةُ فَلَا تَأْتُوهَا تَسْعَوْنَ، وَأْتُوهَا تَمْشُونَ وَعَلَيْكُمُ السَّكِينَةُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'إِذَا سَمِعْتُمُ النِّدَاءَ فَقُولُوا مِثْلَ مَا يَقُولُ الْمُؤَذِّنُ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ، وَمَا زَادَ اللَّهُ عَبْدًا بِعَفْوٍ إِلَّا عِزًّا', ref: 'رواه الترمذي عن أبي هريرة رضي الله عنه' },
    { text: 'اللَّهُمَّ مَا أَصْبَحَ بِنَا مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ، فَإِنَّهَا مِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ', ref: 'رواه أبو داود عن أنس بن مالك رضي الله عنه' },
    { text: 'الْمَرْءُ عَلَى دِينِ خَلِيلِهِ، فَلْيَنظُرْ أَحَدُكُمْ مَنْ يُخَلِّلُ', ref: 'رواه الترمذي عن أبي هريرة رضي الله عنه' },
    { text: 'لَا تَحْقِرَنَّ مِنَ الْمَعْرُوفِ شَيْئًا، وَلَوْ أَنْ تَلْقَى أَخَاكَ بِوَجْهٍ طَلْقٍ', ref: 'رواه الترمذي عن أبي ذر رضي الله عنه' },
    { text: 'إِنَّ اللَّهَ جَمِيلٌ يُحِبُّ الْجَمَالَ', ref: 'رواه مسلم عن عبد الله بن مسعود رضي الله عنه' },
    { text: 'خَيْرُ يَوْمٍ طَلَعَتْ فِيهِ الشَّمْسُ يَوْمُ الْجُمُعَةِ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'اللَّهُمَّ أَعُوذُ بِكَ مِنَ الكَسَلِ وَالْجُبْنِ، وَمِنْ شَرِّ مَا أَتَى بِهِ اللَّيْلُ', ref: 'رواه مسلم عن أنس بن مالك رضي الله عنه' },
    { text: 'اللَّهُمَّ اجْعَلْ لِي فِي كُلِّ ضِيقٍ فَرَجًا، وَفِي كُلِّ هَمٍّ مَخْرَجًا', ref: 'رواه أبو داود عن ابن مسعود رضي الله عنه' },
    { text: 'مَن تَصَبَّرَ عَلَى مُصِيبَةٍ أَجَرَهُ اللَّهُ عَلَيْهَا', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' },
    { text: 'مَن كَانَ فِي حَاجَةِ أَخِيهِ كَانَ اللَّهُ فِي حَاجَتِهِ', ref: 'متفق عليه عن عبد الله بن عمر رضي الله عنهما' },
    { text: 'لَا يَزَالُ الْمُسْلِمُ يُسَأَلُ عَنْ أُمُورٍ مُبْهَمَاتٍ حَتَّى يَكُفَّ عَن ذِكْرِهِنَّ', ref: 'رواه مسلم عن أبي هريرة رضي الله عنه' },
    { text: 'مَن قَالَ: رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا، وَجَبَتْ لَهُ الْجَنَّةُ', ref: 'رواه أحمد عن أنس بن مالك رضي الله عنه' },
    { text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْعُجْرِ وَالْبُخْرِ', ref: 'رواه مسلم عن يزيد بن الأسود رضي الله عنه' },
    { text: 'إِنَّ لِلَّهِ تِسْعًا وَتِسْعِينَ اسْمًا، مَن أَحْصَاهَا دَخَلَ الْجَنَّةَ', ref: 'متفق عليه عن أبي هريرة رضي الله عنه' },
    { text: 'أَفْضَلُ مَا قِيلَ وَقِيلَ: لَا إِلَهَ إِلَّا اللَّهُ', ref: 'رواه الترمذي عن أنس بن مالك رضي الله عنه' }
  ];

  const PRE_ADHAN_OPTIONS = [0, 5, 10, 15, 20];
  const normalizePreAdhanMinutes = (value) =>
    PRE_ADHAN_OPTIONS.includes(Number(value)) ? Number(value) : 5;

  // موجب = قبل الأذان، صفر = معه، سالب = بعده (مطابق للخيارات في main.js).
  const FOCUS_LEAD_OPTIONS = [30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30];
  const FOCUS_DURATION_OPTIONS = [5, 10, 15, 30];
  const normalizeFocusLeadMinutes = (value) =>
    FOCUS_LEAD_OPTIONS.includes(Number(value)) ? Number(value) : 5;
  const normalizeFocusDurationMinutes = (value) =>
    FOCUS_DURATION_OPTIONS.includes(Number(value)) ? Number(value) : 5;

  // موضع أداة شريط المهام نفسها: 0 = يمين الشاشة، 100 = يسار الشاشة.
  const normalizeTaskbarPosition = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 100;
  };
  const taskbarPositionLabel = (value) => {
    if (value <= 20) return 'يمين الشاشة';
    if (value >= 80) return 'يسار الشاشة';
    return 'وسط الشاشة';
  };
  // أثناء السحب السريع نتجاهل ردود الإصدارات الأقدم حتى لا يرتد المؤشر للخلف.
  let taskbarPositionRequested = null;

  const SOUND_FILES = {
    makkah: '../assets/sounds/makkah.mp3',
    madinah: '../assets/sounds/madinah.mp3',
    abdulbasit: '../assets/sounds/abdulbasit.mp3'
  };
  const SOUND_LABELS = {
    makkah: 'أذان مكة',
    madinah: 'أذان المدينة',
    abdulbasit: 'أذان عبد الباسط عبد الصمد'
  };

  const state = {
    settings: null,
    meta: null,
    today: null,
    spiritualKey: null,
    spiritualVerseIndex: 0,
    spiritualHadithIndex: 0,
    view: 'home',
    month: { year: null, month: null, data: null, seq: 0, loading: false },
    theme: 'dark',
    refreshing: false,
    lastAutoRefresh: 0,
    searchSeq: 0,
    searchTimer: null,
    searchResults: [],
    locationExpanded: false,
    toastTimer: null,
    bannerTimer: null,
    focus: { active: false, endsAt: 0, adhanAt: 0, dismissOnAdhan: true },
    focusReturnFocus: null,
    chime: null,
    audio: null,
    audioCtx: null,
    impulse: null,
    updaterStatus: null
  };

  /* ---------------- أدوات مساعدة ---------------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function latinDigits(value) {
    return String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  function arabicDigits(value) {
    return String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  }

  function normalizeArabic(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cityDateParts(date, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      const get = (type) => Number(parts.find((part) => part.type === type)?.value);
      return { year: get('year'), month: get('month'), day: get('day') };
    } catch {
      return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
    }
  }

  function timeZone() {
    return state.settings?.location?.timezone || 'UTC';
  }

  function dateAtUtcNoon(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 86_400_000);
  }

  function formatGregorian(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatHijri(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatHijriDay(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
          day: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatMonthYear(year, month) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(Date.UTC(year, month - 1, 15, 12)))
      );
    } catch {
      return `${month}/${year}`;
    }
  }

  function weekdayName(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', timeZone: 'UTC' }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function timeParts(iso) {
    if (!iso) return { text: '—', period: '' };
    const use12 = state.settings?.timeFormat !== '24';
    try {
      const options = use12
        ? { timeZone: timeZone(), hour: 'numeric', minute: '2-digit', hour12: true }
        : { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
      const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date(iso));
      const hour = parts.find((part) => part.type === 'hour')?.value || '--';
      const minute = parts.find((part) => part.type === 'minute')?.value || '--';
      return { text: `${hour}:${minute}`, period: '' };
    } catch {
      return { text: '—', period: '' };
    }
  }

  function displayTime(iso) {
    return timeParts(iso).text;
  }

  function time24(iso) {
    if (!iso) return '—';
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timeZone(),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date(iso));
      const hour = parts.find((part) => part.type === 'hour')?.value || '--';
      const minute = parts.find((part) => part.type === 'minute')?.value || '--';
      return `${hour}:${minute}`;
    } catch {
      return '—';
    }
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function humanRemaining(ms) {
    const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
    if (totalMinutes <= 0) return 'أقل من دقيقة';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hourText =
      hours === 0
        ? ''
        : hours === 1
          ? 'ساعة'
          : hours === 2
            ? 'ساعتان'
            : hours <= 10
              ? `${hours} ساعات`
              : `${hours} ساعة`;
    const minuteText =
      minutes === 0
        ? ''
        : minutes === 1
          ? 'دقيقة'
          : minutes === 2
            ? 'دقيقتان'
            : minutes <= 10
              ? `${minutes} دقائق`
              : `${minutes} دقيقة`;
    return [hourText, minuteText].filter(Boolean).join(' و ') || 'أقل من دقيقة';
  }

  function basename(filePath) {
    if (!filePath) return '';
    return String(filePath).split(/[\\/]/).pop() || '';
  }

  function fileUrl(filePath) {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized
        .split('/')
        .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
        .join('/')}`;
    }
    return `file://${encodeURI(normalized)}`;
  }

  function soundAssetUrl(sound) {
    const packaged = state.meta?.soundUrls?.[sound];
    if (packaged) return packaged;
    const relative = SOUND_FILES[sound];
    if (!relative) return null;
    try {
      return new URL(relative, window.location.href).href;
    } catch {
      return relative;
    }
  }

  function soundLabel(sound) {
    if (sound === 'custom') return basename(state.settings?.customSoundPath) || 'ملف خاص';
    return SOUND_LABELS[sound] || 'صوت الأذان';
  }

  function extractError(error) {
    const message = String(error?.message || error || 'حدث خطأ غير متوقع');
    const parts = message.split('Error:');
    return (parts[parts.length - 1] || message).trim();
  }

  function sameCoords(a, b) {
    return (
      a &&
      b &&
      Math.abs(a.lat - b.lat) < 0.02 &&
      Math.abs(a.lng - b.lng) < 0.02
    );
  }

  function showToast(message) {
    const toast = $('toast');
    $('toastText').textContent = message;
    clearTimeout(state.toastTimer);
    if (toast.hidden) {
      toast.hidden = false;
      requestAnimationFrame(() => toast.classList.add('show'));
    } else {
      toast.classList.add('show');
    }
    state.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.hidden = true;
      }, 260);
    }, 3200);
  }

  function hideSplash() {
    const splash = $('splash');
    splash.classList.add('hide');
  }

  /* ---------------- المظهر ---------------- */

  function applyTheme() {
    if (!state.settings) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const setting = state.settings.theme;
    const resolved =
      setting === 'auto'
        ? media.matches
          ? 'dark'
          : 'light'
        : setting === 'gold'
          ? 'gold'
          : setting === 'light'
            ? 'light'
            : 'dark';
    state.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    const meta = THEME_META[resolved] || THEME_META.dark;
    const themeUse = $('themeIcon').querySelector('use');
    if (themeUse) themeUse.setAttribute('href', meta.icon);
    $('themeLabel').textContent = meta.label;
    const menu = $('themeMenu');
    if (menu && !menu.hidden) renderThemeMenu();
  }

  function renderThemeMenu() {
    const menu = $('themeMenu');
    if (!menu || !state.settings) return;
    menu.replaceChildren();
    const setting = state.settings.theme || 'dark';
    const selected = setting === 'auto' ? state.theme : setting;
    THEME_OPTIONS.forEach((option) => {
      const item = document.createElement('button');
      const active = selected === option.value;
      item.className = `theme-option${active ? ' active' : ''}`;
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(active));
      item.innerHTML =
        `<svg class="icon"><use href="${option.icon}"/></svg><span class="theme-option-label"></span>` +
        '<svg class="icon result-check" aria-hidden="true"><use href="#i-check"/></svg>';
      item.querySelector('.theme-option-label').textContent = option.label;
      item.addEventListener('click', () => {
        closeThemeMenu();
        if ((state.settings?.theme || 'dark') === option.value) return;
        saveSettings({ theme: option.value }, { toast: `تم تفعيل ${option.label}` });
      });
      menu.appendChild(item);
    });
  }

  function openThemeMenu() {
    renderThemeMenu();
    const menu = $('themeMenu');
    if (!menu) return;
    menu.hidden = false;
    $('themeToggle').setAttribute('aria-expanded', 'true');
  }

  function closeThemeMenu() {
    const menu = $('themeMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    $('themeToggle').setAttribute('aria-expanded', 'false');
  }

  /* ---------------- التاريخ ---------------- */

  function renderDates() {
    if (!state.settings) return;
    const parts = cityDateParts(new Date(), timeZone());
    const base = dateAtUtcNoon(parts);
    const offset = Number(state.settings.hijriOffset) || 0;
    const gregorian = formatGregorian(base);
    const hijri = formatHijri(addDays(base, offset));

    $('topHijri').textContent = hijri;
    $('topGreg').textContent = gregorian;
    $('heroHijri').textContent = hijri.replace(/\s*هـ\s*$/, '');
  }

  /* ---------------- بطاقات الصلوات ---------------- */

  function renderPrayerGrid() {
    if (!state.today) return;
    const grid = $('prayerGrid');
    const now = Date.now();
    const nextKey = state.today.next?.key;
    const prevKey = state.today.next?.prevKey;
    const prevIso = state.today.next?.prevTimeISO;
    const prevIsToday =
      !!prevIso &&
      dateKey(cityDateParts(new Date(prevIso), timeZone())) === state.today.dateKey;

    grid.innerHTML = PRAYERS.map((prayer) => {
      const iso = state.today.times[prayer.key];
      const ms = iso ? Date.parse(iso) : NaN;
      const isNext = prayer.key === nextKey;
      const isCurrent = !isNext && prayer.key === prevKey && prevIsToday;
      const isPassed = !isNext && !isCurrent && Number.isFinite(ms) && ms <= now;
      const classes = ['prayer-card'];
      if (isNext) classes.push('next');
      if (isCurrent) classes.push('current');
      if (isPassed) classes.push('passed');

      let status = '';
      if (prayer.key !== 'sunrise') {
        if (isNext) status = 'القادمة';
        else if (isCurrent) status = 'الآن';
        else if (isPassed) status = 'انتهت';
      }

      return `
        <article class="${classes.join(' ')}" data-prayer="${prayer.key}">
          <span class="p-name">${prayer.name}</span>
          <span class="p-time">${displayTime(iso)}</span>
          <span class="p-status">${status}</span>
        </article>`;
    }).join('');
  }

  // آخر صلاة دخل وقتها فعلياً — مصدر واحد للفترة الحالية في الشاشة الرئيسية
  // وفي شاشة التركيز، حتى تبقى التسميتان متطابقتين دائماً.
  function latestPassedPrayerKey() {
    if (!state.today?.times) return null;
    const now = Date.now();
    let key = null;
    let latest = -Infinity;
    for (const prayer of PRAYERS) {
      const ms = Date.parse(state.today.times[prayer.key]);
      if (Number.isFinite(ms) && ms <= now && ms > latest) {
        latest = ms;
        key = prayer.key;
      }
    }
    return key;
  }

  function currentPrayerLabel() {
    const key = latestPassedPrayerKey();
    if (key && PRAYER_NAMES[key]) return PRAYER_NAMES[key];
    const prevKey = state.today?.next?.prevKey;
    if (prevKey && PRAYER_NAMES[prevKey]) return PRAYER_NAMES[prevKey];
    return 'بين الصلوات';
  }

  // يختار الوقت الحالي من المواقيت نفسها (بما فيها الشروق) لعنوان البطاقة فقط.
  function currentSpiritualKey() {
    if (!state.today?.times) return null;
    const key = latestPassedPrayerKey();
    if (SPIRITUAL_PERIODS[key]) return key;
    const next = state.today.next || {};
    if (SPIRITUAL_PERIODS[next.prevKey]) return next.prevKey;
    return SPIRITUAL_PERIODS[next.key] ? next.key : 'fajr';
  }

  function spiritualPool(kind) {
    return kind === 'verse' ? SPIRITUAL_VERSES : SPIRITUAL_HADITHS;
  }

  function spiritualEntry(kind) {
    const pool = spiritualPool(kind);
    const index = kind === 'verse' ? state.spiritualVerseIndex : state.spiritualHadithIndex;
    return pool[index % pool.length] || pool[0];
  }

  // يقدّم خطوة واحدة في المكتبة كاملة (يدوياً أو عند انتقال الصلاة)،
  // ويتخطّى أي نص مكرر مجاور حتى لا يظهر النص نفسه مرتين متتاليتين.
  function advanceSpiritual(kind) {
    const pool = spiritualPool(kind);
    if (pool.length <= 1) return;
    const currentIndex = kind === 'verse' ? state.spiritualVerseIndex : state.spiritualHadithIndex;
    const currentText = pool[currentIndex % pool.length]?.text;
    let nextIndex = (currentIndex + 1) % pool.length;
    for (let offset = 0; offset < pool.length; offset += 1) {
      if (pool[nextIndex]?.text !== currentText) break;
      nextIndex = (nextIndex + 1) % pool.length;
    }
    if (kind === 'verse') state.spiritualVerseIndex = nextIndex;
    else state.spiritualHadithIndex = nextIndex;
  }

  // النص الفعّال حالياً (تلقائي أو بعد تصفّح يدوي) — مصدر واحد لبطاقة النور
  // ولشاشة التركيز كي تبقىا متزامنتين دائماً.
  function activeSpiritualTexts() {
    const key = state.spiritualKey || currentSpiritualKey() || 'fajr';
    return {
      period: SPIRITUAL_PERIODS[key] || SPIRITUAL_PERIODS.fajr,
      verse: spiritualEntry('verse'),
      hadith: spiritualEntry('hadith')
    };
  }

  // يعرض النصوص فوراً دون انتظار تحديث العدّاد؛ الفهرس يتقدّم في مكتبة
  // مستقلة عن الصلاة، فلا ينتهي عند ثلاثة نصوص ولا يعتمد على موضوع الأذان.
  function paintSpiritual() {
    const { period, verse, hadith } = activeSpiritualTexts();
    $('spiritualPeriod').textContent = period;
    $('verseText').textContent = verse.text;
    $('verseRef').textContent = verse.ref;
    $('hadithText').textContent = hadith.text;
    $('hadithRef').textContent = hadith.ref;
    // نافذة الزجاج المستقلة تعرض نفس النص الفعّال (بما فيه تصفّح "التالي").
    if (api.sendFocusTexts) {
      api.sendFocusTexts({
        verse: verse.text,
        verseRef: verse.ref,
        hadith: hadith.text,
        hadithRef: hadith.ref,
        prayer: currentPrayerLabel()
      }).catch(() => {});
    }
  }

  function renderSpiritual(force = false) {
    if (!state.today) return;
    const key = currentSpiritualKey();
    if (!key) return;
    if (!force && state.spiritualKey === key) return;
    const changed = !!state.spiritualKey && state.spiritualKey !== key;
    state.spiritualKey = key;
    // انتقال الصلاة: خطوة جديدة في المكتبة بدل العودة إلى النص الأول.
    if (changed) {
      advanceSpiritual('verse');
      advanceSpiritual('hadith');
    }
    paintSpiritual();
  }

  function cycleSpiritual(kind) {
    if (!state.today) return;
    if (!state.spiritualKey) {
      const initial = currentSpiritualKey();
      if (!initial) return;
      state.spiritualKey = initial;
    }
    advanceSpiritual(kind);
    paintSpiritual();
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function renderNotificationStatus() {
    if (!state.settings) return;
    const enabled = !!state.settings.notifications;
    $('muteBtn').classList.toggle('muted', !enabled);
    $('muteIcon').querySelector('use').setAttribute('href', enabled ? '#i-bell' : '#i-bell-off');
    $('muteBtn').title = enabled ? 'كتم التنبيهات' : 'تفعيل التنبيهات';
  }

  function renderToday() {
    if (!state.today) return;
    const data = state.today;
    const next = data.next;
    const parts = timeParts(next.timeISO);

    $('nextName').textContent = next.name;
    $('nextTime').textContent = parts.text;
    $('ringPrayer').textContent = next.name;
    $('heroCity').textContent = data.location.name;
    $('ringArc').style.strokeDasharray = String(RING_CIRCUMFERENCE);
    renderPrayerGrid();
    renderSpiritual();
    renderDates();
    renderNotificationStatus();
    updateCountdown(true);
  }

  function updateCountdown(force = false) {
    if (!state.today?.next?.timeISO) return;
    const nextMs = Date.parse(state.today.next.timeISO);
    const prevMs = state.today.next.prevTimeISO ? Date.parse(state.today.next.prevTimeISO) : NaN;
    const now = Date.now();
    const remaining = nextMs - now;

    $('countdown').textContent = formatCountdown(Math.max(0, remaining));
    $('remainingText').textContent = humanRemaining(Math.max(0, remaining));
    renderSpiritual();

    if (Number.isFinite(prevMs) && nextMs > prevMs) {
      const fraction = clamp((now - prevMs) / (nextMs - prevMs), 0, 1);
      $('ringArc').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
    }

    if (remaining <= 0 && !state.refreshing && now - state.lastAutoRefresh > 8000) {
      state.lastAutoRefresh = now;
      refreshToday();
    }
  }

  /* ---------------- الإعدادات والواجهة ---------------- */

  function hasSavedLocation() {
    const location = state.settings?.location;
    return !!(
      location &&
      location.name &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    );
  }

  function isLocationCollapsed() {
    return hasSavedLocation() && !state.locationExpanded;
  }

  function applyLocationCollapse() {
    const card = $('locationCard');
    if (!card) return;
    const collapsed = isLocationCollapsed();
    card.classList.toggle('collapsed', collapsed);
    card.setAttribute('aria-expanded', String(!collapsed));
  }

  function syncSettingsUI() {
    if (!state.settings) return;
    const s = state.settings;
    const location = s.location;

    applyLocationCollapse();
    $('notifToggle').checked = !!s.notifications;
    if ($('preAdhanSelect')) {
      $('preAdhanSelect').value = String(normalizePreAdhanMinutes(s.preAdhanMinutes));
    }
    if ($('focusToggle')) {
      $('focusToggle').checked = !!s.focusEnabled;
      $('focusLeadSelect').value = String(normalizeFocusLeadMinutes(s.focusLeadMinutes));
      $('focusDurationSelect').value = String(normalizeFocusDurationMinutes(s.focusDurationMinutes));
      $('focusDismissToggle').checked = s.focusDismissOnAdhan !== false;
      $('focusCloseNoticeToggle').checked = !!s.focusCloseNotice;
      $('focusOptions').hidden = !s.focusEnabled;
      if (!s.focusEnabled && state.focus.active) hideFocusOverlay();
    }
    $('themeSelect').value = s.theme;
    $('timeFormat').value = String(s.timeFormat);
    $('trayToggle').checked = !!s.closeToTray;
    $('taskbarToggle').checked = s.taskbarWidgetEnabled !== false;
    if ($('taskbarPositionSlider')) {
      const taskbarPosition = normalizeTaskbarPosition(s.taskbarPosition);
      if (taskbarPositionRequested === null || taskbarPositionRequested === taskbarPosition) {
        taskbarPositionRequested = null;
        $('taskbarPositionSlider').value = String(taskbarPosition);
        $('taskbarPositionValue').textContent = taskbarPositionLabel(taskbarPosition);
      }
    }
    $('autoStartToggle').checked = !!s.autoLaunch;
    $('volumeRange').value = String(Math.round((s.volume ?? 0.85) * 100));
    $('volumeValue').textContent = `${Math.round((s.volume ?? 0.85) * 100)}%`;

    $('setCity').textContent = location.name;
    $('setCountry').textContent = [location.country, location.source === 'ip' ? 'تحديد تلقائي' : null]
      .filter(Boolean)
      .join(' • ');
    $('setCoords').textContent = `${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)} • ${location.timezone}`;

    $('topCity').textContent = location.name;
    $('topCountry').textContent = location.country || location.timezone;

    if ($('soundSelect')) $('soundSelect').value = s.sound;
    $('customSoundRow').hidden = s.sound !== 'custom';
    $('customSoundName').textContent = s.customSoundPath
      ? basename(s.customSoundPath)
      : 'لم يتم اختيار ملف';
  }

  async function refreshToday() {
    if (!state.settings) return;
    try {
      state.today = await api.getToday();
      renderToday();
      syncSettingsUI();
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshView() {
    const button = $('refreshBtn');
    if (!button || button.disabled) return;
    const previousRefreshing = state.refreshing;
    const startedAt = Date.now();
    button.disabled = true;
    button.classList.add('spinning');
    state.refreshing = true;
    try {
      await api.resetZoom();
      state.today = await api.getToday();
      renderToday();
      syncSettingsUI();
      const month = currentMonth();
      await loadMonth(month.year, month.month, { scroll: 'today', silent: true });
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) {
        await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
      }
      showToast('تم تحديث العرض والمواقيت.');
    } catch (error) {
      console.error(error);
      showToast('تعذّر تحديث العرض والمواقيت.');
    } finally {
      state.refreshing = previousRefreshing;
      button.classList.remove('spinning');
      button.disabled = false;
    }
  }

  async function saveSettings(patch, options = {}) {
    if (!state.settings) return;
    const previous = state.settings;
    try {
      const response = await api.saveSettings(patch);
      const next = response.settings;
      const timesChanged =
        previous.location.lat !== next.location.lat ||
        previous.location.lng !== next.location.lng ||
        previous.location.timezone !== next.location.timezone ||
        previous.method !== next.method ||
        previous.madhab !== next.madhab ||
        previous.highLatitude !== next.highLatitude;

      state.settings = next;
      applyTheme();
      syncSettingsUI();

      if (!options.lightweight) {
        if (timesChanged) {
          await refreshToday();
          if (state.month.data) {
            await loadMonth(state.month.year, state.month.month, { silent: true });
          }
        } else {
          renderPrayerGrid();
          renderDates();
          renderNotificationStatus();
          if (state.month.data) renderMonth();
        }
      }

      if (options.toast) showToast(options.toast);
    } catch (error) {
      console.error(error);
      showToast('تعذّر حفظ الإعدادات. حاول مرة أخرى.');
    }
  }

  function applyExternalSettings(next) {
    if (!state.settings) {
      state.settings = next;
      applyTheme();
      syncSettingsUI();
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(state.settings)) return;
    state.settings = next;
    applyTheme();
    syncSettingsUI();
    refreshToday();
    if (state.month.data) loadMonth(state.month.year, state.month.month, { silent: true });
  }

  /* ---------------- الشهر ---------------- */

  function initMonthState() {
    const parts = cityDateParts(new Date(), timeZone());
    state.month.year = parts.year;
    state.month.month = parts.month;
  }

  async function loadMonth(year, month, options = {}) {
    if (!state.settings) return;
    const seq = ++state.month.seq;
    state.month.loading = true;
    state.month.year = year;
    state.month.month = month;
    $('monthSub').textContent = 'جارٍ حساب مواقيت الشهر…';

    try {
      const data = await api.getMonth(year, month);
      if (seq !== state.month.seq) return;
      state.month.data = data;
      state.month.year = data.year;
      state.month.month = data.month;
      renderMonth();
      if (options.scroll) setMonthScroll(options.scroll);
    } catch (error) {
      if (seq === state.month.seq) {
        $('monthSub').textContent = 'تعذّر تحميل المواقيت';
        if (!options.silent) showToast('تعذّر تحميل جدول الشهر.');
      }
    } finally {
      if (seq === state.month.seq) state.month.loading = false;
    }
  }

  function renderMonth() {
    const data = state.month.data;
    if (!data) return;
    const body = $('monthTable').querySelector('tbody');
    const todayParts = cityDateParts(new Date(), timeZone());
    const todayKey = dateKey(todayParts);
    const fragment = document.createDocumentFragment();

    for (const item of data.days) {
      const date = new Date(Date.UTC(data.year, data.month - 1, item.day, 12));
      const weekday = weekdayName(date);
      const key = `${data.year}-${String(data.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
      const row = document.createElement('tr');
      if (key === todayKey) row.classList.add('today');
      else if (date.getUTCDay() === 5) row.classList.add('friday');

      const values = [
        weekday,
        formatHijriDay(date),
        ...PRAYERS.map((prayer) => displayTime(item.times[prayer.key]))
      ];
      const cells = [
        `<td><div class="day-cell"><b>${item.day}</b><span>${weekday}</span></div></td>`,
        `<td class="hijri-cell">${values[1]}</td>`,
        ...values.slice(2).map((value) => `<td>${value}</td>`)
      ];
      row.innerHTML = cells.join('');
      fragment.appendChild(row);
    }

    body.replaceChildren(fragment);
    $('monthLabel').textContent = formatMonthYear(data.year, data.month);
    $('monthSub').textContent = `${data.location.name} • ${data.days.length} يومًا • بتوقيت المدينة`;
    $('monthMethod').textContent = `${data.methodLabel} • ${data.location.name}`;
  }

  function setMonthScroll(position) {
    const box = document.querySelector('.table-scroll');
    if (!box) return;
    if (position !== 'today') {
      box.scrollTop = 0;
      return;
    }
    requestAnimationFrame(() => {
      const row = $('monthTable').querySelector('tbody tr.today');
      if (!row) {
        box.scrollTop = 0;
        return;
      }
      const boxRect = box.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const target =
        box.scrollTop + rowRect.top - boxRect.top - (box.clientHeight - rowRect.height) / 2;
      box.scrollTop = Math.max(0, Math.min(target, box.scrollHeight - box.clientHeight));
    });
  }

  function currentMonth() {
    const parts = cityDateParts(new Date(), timeZone());
    return { year: parts.year, month: parts.month };
  }

  function changeMonth(delta) {
    const base = state.month.data
      ? { year: state.month.data.year, month: state.month.data.month }
      : currentMonth();
    let month = base.month + delta;
    let year = base.year;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    loadMonth(year, month, { scroll: 'top' });
  }

  /* ---------------- البحث عن المدن ---------------- */

  function localCities(query) {
    const q = normalizeArabic(query);
    if (!q) return [];
    return (window.SALATI_CITIES || [])
      .filter((city) => normalizeArabic(`${city.name} ${city.en} ${city.country}`).includes(q))
      .slice(0, 6)
      .map((city) => ({
        name: city.name,
        country: city.country,
        countryCode: city.cc,
        lat: city.lat,
        lng: city.lng,
        timezone: city.tz,
        source: 'search'
      }));
  }

  function dedupeCities(cities) {
    const seen = new Set();
    const out = [];
    for (const city of cities) {
      const key = `${normalizeArabic(city.name)}|${normalizeArabic(city.country)}|${Number(city.lat).toFixed(2)}|${Number(city.lng).toFixed(2)}`;
      const keyLoose = `${normalizeArabic(city.name)}|${normalizeArabic(city.country)}`;
      if (seen.has(key) || seen.has(keyLoose)) continue;
      seen.add(key);
      seen.add(keyLoose);
      out.push(city);
    }
    return out;
  }

  function renderCityResults(results, loading = false) {
    const container = $('cityResults');
    container.replaceChildren();
    if (!results.length) {
      container.hidden = false;
      if (loading) {
        const div = document.createElement('div');
        div.className = 'search-empty';
        div.textContent = 'جارٍ البحث…';
        container.appendChild(div);
      } else {
        const div = document.createElement('div');
        div.className = 'search-empty';
        div.textContent = 'لم نجد هذه المدينة. جرّب كتابة الاسم بالعربية أو الإنجليزية.';
        container.appendChild(div);
      }
      state.searchResults = [];
      return;
    }

    state.searchResults = results;
    const current = state.settings?.location;
    results.forEach((city, index) => {
      const button = document.createElement('button');
      button.className = 'city-result';
      button.type = 'button';
      button.innerHTML =
        '<svg class="icon"><use href="#i-pin"/></svg><span class="city-result-text"><b></b><span></span></span>';
      button.querySelector('b').textContent = city.name;
      button.querySelector('.city-result-text span').textContent = [city.country, city.timezone]
        .filter(Boolean)
        .join(' • ');
      if (sameCoords(current, city)) {
        const check = document.createElement('svg');
        check.setAttribute('class', 'icon result-check');
        check.innerHTML = '<use href="#i-check"/>';
        button.appendChild(check);
      }
      button.addEventListener('click', () => selectCity(city));
      container.appendChild(button);
    });
    container.hidden = false;
  }

  async function runSearch(query) {
    const clean = query.trim();
    const seq = ++state.searchSeq;
    if (clean.length < 2) {
      $('cityResults').hidden = true;
      $('searchSpinner').hidden = true;
      return;
    }
    const local = localCities(clean);
    renderCityResults(local, true);
    $('searchSpinner').hidden = false;
    try {
      const remote = await api.searchCities(clean);
      if (seq !== state.searchSeq) return;
      const merged = dedupeCities([...local, ...(Array.isArray(remote) ? remote : [])]);
      renderCityResults(merged, false);
    } catch {
      if (seq === state.searchSeq) renderCityResults(local, false);
    } finally {
      if (seq === state.searchSeq) $('searchSpinner').hidden = true;
    }
  }

  async function selectCity(city) {
    const location = {
      name: city.name,
      country: city.country || '',
      countryCode: String(city.countryCode || city.cc || '').toUpperCase(),
      lat: Number(city.lat),
      lng: Number(city.lng),
      timezone: city.timezone || city.tz,
      source: 'search'
    };
    $('cityResults').hidden = true;
    $('citySearch').value = '';
    state.searchSeq += 1;
    state.locationExpanded = false;
    await saveSettings({ location }, { toast: `تم اختيار ${location.name}` });
  }

  async function detectLocation(button) {
    if (!button) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'جارٍ تحديد الموقع…';
    try {
      const location = await api.detectLocation();
      state.locationExpanded = false;
      await saveSettings({ location }, { toast: `تم تحديد موقعك: ${location.name}` });
    } catch (error) {
      showToast(extractError(error));
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  /* ---------------- الصوت ---------------- */

  function getAudioContext() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    return state.audioCtx;
  }

  function impulseResponse(ctx) {
    if (state.impulse) return state.impulse;
    const seconds = 2.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
      }
    }
    state.impulse = buffer;
    return buffer;
  }

  function stopChime() {
    if (!state.chime || !state.audioCtx) return;
    const { master, nodes, ctx } = state.chime;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value || 0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* ignore */
    }
    const toStop = nodes;
    setTimeout(() => {
      for (const node of toStop) {
        try {
          node.stop();
        } catch {
          /* ignore */
        }
      }
    }, 320);
    state.chime = null;
  }

  function stopAudio() {
    stopChime();
    if (state.audio) {
      try {
        state.audio.pause();
        state.audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      state.audio = null;
    }
  }

  function playChime(volume = 0.8, short = false) {
    stopAudio();
    const ctx = getAudioContext();
    if (!ctx) return;
    const start = ctx.currentTime + 0.06;
    const master = ctx.createGain();
    master.gain.value = clamp(volume, 0, 1) * 0.75;
    master.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    convolver.connect(wet);
    wet.connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    dry.connect(master);

    const nodes = [];

    function note(frequency, offset, duration, level) {
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start + offset);
      envelope.gain.exponentialRampToValueAtTime(level, start + offset + 0.035);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      envelope.connect(dry);
      envelope.connect(convolver);

      const fundamental = ctx.createOscillator();
      fundamental.type = 'sine';
      fundamental.frequency.value = frequency;
      fundamental.connect(envelope);
      fundamental.start(start + offset);
      fundamental.stop(start + offset + duration + 0.05);
      nodes.push(fundamental);

      const harmonic = ctx.createOscillator();
      harmonic.type = 'triangle';
      harmonic.frequency.value = frequency * 2;
      const harmonicGain = ctx.createGain();
      harmonicGain.gain.value = 0.055;
      harmonic.connect(harmonicGain);
      harmonicGain.connect(envelope);
      harmonic.start(start + offset);
      harmonic.stop(start + offset + duration + 0.05);
      nodes.push(harmonic);
    }

    const melody = short
      ? [
          [392.0, 0.0, 2.2, 0.17],
          [523.25, 0.45, 2.8, 0.14]
        ]
      : [
          [293.66, 0.0, 3.0, 0.15],
          [349.23, 0.85, 2.6, 0.12],
          [440.0, 1.7, 3.0, 0.14],
          [392.0, 2.65, 3.0, 0.12],
          [349.23, 3.55, 2.8, 0.11],
          [293.66, 4.45, 3.6, 0.14],
          [440.0, 5.5, 3.4, 0.12]
        ];

    for (const [frequency, offset, duration, level] of melody) {
      note(frequency, offset, duration, level);
    }

    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 146.83;
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, start);
    droneGain.gain.exponentialRampToValueAtTime(0.035, start + 0.8);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, start + (short ? 4.5 : 8.5));
    drone.connect(droneGain);
    droneGain.connect(master);
    drone.start(start);
    drone.stop(start + (short ? 4.8 : 9));
    nodes.push(drone);

    state.chime = { ctx, master, nodes };
  }

  function playCustom(url, volume, { showBanner = true, title = '', subtitle = '' } = {}) {
    if (!url) {
      playChime(volume, false);
      return;
    }
    stopAudio();
    try {
      const audio = new Audio(url);
      audio.volume = clamp(volume, 0, 1);
      state.audio = audio;
      audio.addEventListener('ended', () => {
        state.audio = null;
        hideAdhanBanner();
      });
      audio.play().catch(() => {
        state.audio = null;
        playChime(volume, false);
      });
      if (showBanner) showAdhanBanner(title || 'حان وقت الصلاة', subtitle, true, 0);
    } catch {
      playChime(volume, false);
    }
  }

  function previewSound() {
    if (!state.settings) return;
    const { sound, volume, customSoundPath } = state.settings;
    if (sound === 'none') {
      showToast('خيار «إشعار فقط» لا يشغّل صوتًا. اختر أذانًا أو «ملف خاص» لمعاينة الصوت.');
      return;
    }
    showAdhanBanner('معاينة صوت الأذان', soundLabel(sound), true, 10_000);
    const url = sound === 'custom'
      ? customSoundPath
        ? fileUrl(customSoundPath)
        : null
      : soundAssetUrl(sound);
    playCustom(url, volume, { showBanner: false });
  }

  /* ---------------- شريط الأذان ---------------- */

  function showAdhanBanner(title, subtitle, canStop = true, autoHideMs = 0) {
    const banner = $('adhanBanner');
    $('adhanTitle').textContent = title;
    $('adhanSub').textContent = subtitle;
    $('stopAdhan').hidden = !canStop;
    banner.hidden = false;
    clearTimeout(state.bannerTimer);
    if (autoHideMs > 0) {
      state.bannerTimer = setTimeout(hideAdhanBanner, autoHideMs);
    }
  }

  function hideAdhanBanner() {
    clearTimeout(state.bannerTimer);
    $('adhanBanner').hidden = true;
  }

  function handleAdhan(payload) {
    if (!payload) return;
    const pre = payload.kind === 'pre';
    const isTest = payload.test === true;
    const time = displayTime(payload.timeISO);
    const title = isTest
      ? 'تجربة التنبيه'
      : pre
        ? `اقتربت صلاة ${payload.prayerName}`
        : `حان وقت صلاة ${payload.prayerName}`;
    const subtitle = isTest
      ? `هكذا سيصلك تنبيه الصلاة القادمة: ${payload.prayerName} ${time}`
      : `${time} • ${state.settings?.location?.name || ''}`.trim();
    const volume = Number.isFinite(payload.volume) ? payload.volume : state.settings?.volume ?? 0.85;

    if (payload.sound === 'none') {
      showAdhanBanner(title, subtitle, false, 8000);
      return;
    }

    if (payload.sound === 'custom' && payload.customUrl) {
      showAdhanBanner(title, subtitle, true, 0);
      playCustom(payload.customUrl, volume, { showBanner: false });
      return;
    }

    if (!pre) {
      const url = payload.soundUrl || soundAssetUrl(payload.sound);
      if (url) {
        showAdhanBanner(title, subtitle, true, 0);
        playCustom(url, volume, { showBanner: false });
        return;
      }
    }

    showAdhanBanner(title, subtitle, true, pre ? 7000 : 11000);
    playChime(volume, pre);
  }

  /* ---------------- شاشة التركيز قبل الأذان ---------------- */

  // تعرض البطاقة العلوية الفترة الحالية من المواقيت نفسها (لا الصلاة القادمة).
  function paintFocusPrayer() {
    const label = currentPrayerLabel();
    const el = $('focusPrayer');
    if (el.textContent !== label) el.textContent = label;
  }

  // تعكس الشاشة دائماً الآية والحديث الفعّالين في بطاقة "نور الصلاة".
  function paintFocusTexts() {
    const { verse, hadith } = activeSpiritualTexts();
    // تجنّب إعادة رسم النصوص كل ثانية ما لم يتغيّر النص الفعّال فعلاً.
    const write = (id, value) => {
      const el = $(id);
      if (el.textContent !== value) el.textContent = value;
    };
    write('focusVerse', verse.text);
    write('focusVerseRef', verse.ref);
    write('focusHadith', hadith.text);
    write('focusHadithRef', hadith.ref);
  }

  function updateFocusCountdown() {
    if (!state.focus.active) return;
    const now = Date.now();
    let remaining = state.focus.endsAt - now;
    if (state.focus.dismissOnAdhan && state.focus.adhanAt > now) {
      remaining = Math.min(remaining, state.focus.adhanAt - now);
    }
    if (remaining <= 0) {
      hideFocusOverlay();
      return;
    }
    $('focusCountdown').textContent = formatCountdown(remaining);
    $('focusClock').textContent = timeParts(new Date(now).toISOString()).text;
    paintFocusPrayer();
    paintFocusTexts();
  }

  function showFocusOverlay(payload = {}) {
    const adhanMs = Date.parse(payload.timeISO);
    const durationMinutes = normalizeFocusDurationMinutes(
      payload.durationMinutes ?? state.settings?.focusDurationMinutes
    );
    state.focus = {
      active: true,
      endsAt: Date.now() + durationMinutes * 60_000,
      adhanAt: Number.isFinite(adhanMs) ? adhanMs : 0,
      dismissOnAdhan: payload.dismissOnAdhan !== false
    };
    paintFocusPrayer();
    $('focusSub').textContent = payload.preview
      ? 'معاينة • تعود الشاشة بعد انتهاء المدة'
      : `موعد الأذان ${displayTime(payload.timeISO)}`;
    paintFocusTexts();

    const overlay = $('focusOverlay');
    if (overlay.hidden) {
      state.focusReturnFocus = document.activeElement;
      overlay.hidden = false;
      requestAnimationFrame(() => {
        try { $('focusClose').focus({ preventScroll: true }); } catch { /* ignore */ }
      });
    }
    updateFocusCountdown();
  }

  function hideFocusOverlay(fromSignal = false) {
    if (!state.focus.active && $('focusOverlay').hidden) return;
    state.focus.active = false;
    $('focusOverlay').hidden = true;
    // الإشارة القادمة من العملية الرئيسية تعني أن الإخفاء تمّ هناك بالفعل؛
    // إعادة إرسال dismissFocus هنا كانت تُنتج إخفاءً مزدوجاً وتُلغي مؤقّتات الجلسة.
    if (!fromSignal && api.dismissFocus) api.dismissFocus().catch(() => {});
    const previous = state.focusReturnFocus;
    state.focusReturnFocus = null;
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      try { previous.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  /* ---------------- التنقل ---------------- */

  function switchView(view) {
    if (!view || !document.getElementById(`view-${view}`)) return;
    state.view = view;
    $('views').classList.toggle('month-view', view === 'month');
    for (const item of $$('.nav-item')) {
      item.classList.toggle('active', item.dataset.view === view);
    }
    for (const section of $$('.view')) {
      section.classList.toggle('active', section.id === `view-${view}`);
    }
    $('views').scrollTop = 0;
    if (view === 'settings') applyLocationCollapse();
    if (view === 'month') {
      if (state.month.data) {
        renderMonth();
        setMonthScroll('today');
      } else if (state.month.year) {
        loadMonth(state.month.year, state.month.month, { scroll: 'today' });
      }
    }
  }

  /* ---------------- الأحداث ---------------- */

  const UPDATE_LABELS = {
    idle: 'محدّث',
    'up-to-date': 'محدّث',
    checking: 'جاري التحقق...',
    available: 'تحديث متاح',
    'manual-update': 'تحديث متاح',
    downloading: 'جاري التحميل...',
    ready: 'تحديث متاح',
    installing: 'جاري التثبيت...',
    error: 'تعذّر التحقق'
  };
  let updatePillBusy = false;

  function setUpdatePillVersion(version) {
    const el = $('updatePillVersion');
    if (!el || !version) return;
    el.textContent = `v${String(version).replace(/^v/i, '')}`;
  }

  function renderUpdaterState(info) {
    if (!info) return;
    const status = info.status || 'idle';
    const pill = $('updatePill');
    const labelEl = $('updatePillLabel');
    const label = UPDATE_LABELS[status] || UPDATE_LABELS.idle;
    const version = info.current || (state.meta && state.meta.version) || null;
    const percent = Math.round(clamp(Number(info.percent) || 0, 0, 100));

    if (version) setUpdatePillVersion(version);
    if (labelEl) labelEl.textContent = label;

    if (pill) {
      pill.dataset.state = status;
      pill.disabled = ['checking', 'downloading', 'installing'].includes(status);
      let detail = label;
      if (info.version) detail += ` · ${info.version}`;
      if (status === 'downloading') detail += ` · ${arabicDigits(percent)}٪`;
      if (status === 'error' && info.error) detail += ` · ${String(info.error).slice(0, 120)}`;
      pill.title = status === 'available' || status === 'ready' || status === 'manual-update'
        ? `${detail} — اضغط لتثبيت التحديث`
        : status === 'idle' || status === 'up-to-date' || status === 'error'
          ? `${detail} — اضغط للتحقق من التحديثات`
          : detail;
      pill.setAttribute('aria-label', pill.title);
    }

    if ((status === 'available' || status === 'ready') && state.updaterStatus !== status) {
      const toast = status === 'ready' ? `التحديث ${info.version || ''} جاهز للتثبيت` : `يتوفر تحديث جديد: ${info.version || ''}`;
      showToast(toast.trim());
    }
    state.updaterStatus = status;
  }

  async function handleUpdatePillClick() {
    if (updatePillBusy) return;
    const status = state.updaterStatus || 'idle';
    if (['checking', 'downloading', 'installing'].includes(status)) return;
    const pill = $('updatePill');
    if (pill && pill.disabled) return;

    updatePillBusy = true;
    if (pill) pill.disabled = true;
    try {
      await api.oneClickUpdate();
    } catch {
      renderUpdaterState({
        status: 'error',
        current: (state.meta && state.meta.version) || null,
        error: 'تعذّر إكمال طلب التحديث.'
      });
    } finally {
      updatePillBusy = false;
      // The main process owns the state machine; resync instead of guessing stages here.
      try {
        const info = await api.getUpdaterState();
        if (info) renderUpdaterState(info);
      } catch {
        if (pill) pill.disabled = false;
      }
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const viewTarget = event.target.closest('[data-view]');
      if (viewTarget) {
        switchView(viewTarget.dataset.view);
        return;
      }
      if (!event.target.closest('.search-box') && !event.target.closest('.search-results')) {
        if (!$('cityResults').hidden) $('cityResults').hidden = true;
      }
      if (!event.target.closest('.theme-menu-wrap')) closeThemeMenu();
    });

    $('locationPill').addEventListener('click', () => {
      const alreadyOpen = state.view === 'settings' && !isLocationCollapsed();
      state.locationExpanded = !alreadyOpen;
      switchView('settings');
      applyLocationCollapse();
      if (!isLocationCollapsed()) {
        setTimeout(() => $('citySearch').focus(), 260);
      }
    });

    $('themeToggle').addEventListener('click', (event) => {
      event.stopPropagation();
      if (!$('cityResults').hidden) $('cityResults').hidden = true;
      if ($('themeMenu').hidden) openThemeMenu();
      else closeThemeMenu();
    });

    $('muteBtn').addEventListener('click', () => {
      if (!state.settings) return;
      const enabled = !state.settings.notifications;
      saveSettings(
        { notifications: enabled },
        { toast: enabled ? 'تم تفعيل تنبيهات الصلاة' : 'تم كتم تنبيهات الصلاة' }
      );
    });

    $('refreshBtn').addEventListener('click', refreshView);

    $('verseNext').addEventListener('click', () => cycleSpiritual('verse'));
    $('hadithNext').addEventListener('click', () => cycleSpiritual('hadith'));

    $('testNotifBtn2').addEventListener('click', testNotification);

    $('prevMonth').addEventListener('click', () => changeMonth(-1));
    $('nextMonth').addEventListener('click', () => changeMonth(1));
    $('todayMonth').addEventListener('click', () => {
      const now = currentMonth();
      loadMonth(now.year, now.month, { scroll: 'today' });
    });

    $('notifToggle').addEventListener('change', (event) => {
      saveSettings({ notifications: event.target.checked });
    });
    $('preAdhanSelect').addEventListener('change', (event) => {
      const minutes = normalizePreAdhanMinutes(event.target.value);
      const label = event.target.selectedOptions[0]?.textContent.trim() || '';
      saveSettings(
        { preAdhanMinutes: minutes },
        { toast: label ? `تم ضبط التنبيه المسبق: ${label}` : undefined }
      );
    });
    $('focusToggle').addEventListener('change', (event) => {
      saveSettings(
        { focusEnabled: event.target.checked },
        {
          toast: event.target.checked
            ? 'تم تفعيل شاشة التركيز قبل الأذان'
            : 'تم إيقاف شاشة التركيز قبل الأذان'
        }
      );
    });
    $('focusLeadSelect').addEventListener('change', (event) => {
      const label = event.target.selectedOptions[0]?.textContent.trim() || '';
      saveSettings(
        { focusLeadMinutes: normalizeFocusLeadMinutes(event.target.value) },
        { toast: label ? `تم ضبط بدء شاشة التركيز: ${label}` : undefined }
      );
    });
    $('focusDurationSelect').addEventListener('change', (event) => {
      const label = event.target.selectedOptions[0]?.textContent.trim() || '';
      saveSettings(
        { focusDurationMinutes: normalizeFocusDurationMinutes(event.target.value) },
        { toast: label ? `مدة بقاء شاشة التركيز: ${label}` : undefined }
      );
    });
    $('focusDismissToggle').addEventListener('change', (event) => {
      saveSettings({ focusDismissOnAdhan: event.target.checked });
    });
    $('focusCloseNoticeToggle').addEventListener('change', (event) => {
      saveSettings(
        { focusCloseNotice: event.target.checked },
        {
          toast: event.target.checked
            ? 'سيصلك تنبيه قبل إغلاق شاشة التركيز بـ ٣٠ ثانية'
            : 'تم إيقاف تنبيه إغلاق شاشة التركيز'
        }
      );
    });
    $('focusPreviewBtn').addEventListener('click', async () => {
      try {
        if (!(await api.testFocus())) showToast('تعذّر عرض شاشة التركيز.');
      } catch {
        showToast('تعذّر عرض شاشة التركيز.');
      }
    });
    $('focusClose').addEventListener('click', () => hideFocusOverlay());
    $('themeSelect').addEventListener('change', (event) => {
      saveSettings({ theme: event.target.value });
    });
    $('timeFormat').addEventListener('change', (event) => {
      saveSettings({ timeFormat: event.target.value });
    });
    $('trayToggle').addEventListener('change', (event) => {
      saveSettings({ closeToTray: event.target.checked });
    });
    $('taskbarToggle').addEventListener('change', (event) => {
      const enabled = event.target.checked;
      saveSettings(
        { taskbarWidgetEnabled: enabled },
        {
          toast: enabled
            ? 'ستظهر أداة الصلاة داخل شريط المهام'
            : 'تم إخفاء أداة الصلاة من شريط المهام'
        }
      );
    });
    $('taskbarPositionSlider').addEventListener('input', (event) => {
      const value = normalizeTaskbarPosition(event.target.value);
      taskbarPositionRequested = value;
      $('taskbarPositionValue').textContent = taskbarPositionLabel(value);
      saveSettings({ taskbarPosition: value }, { lightweight: true });
    });
    $('taskbarPositionResetBtn').addEventListener('click', () => {
      taskbarPositionRequested = 100;
      saveSettings(
        { taskbarPosition: 100 },
        {
          lightweight: true,
          toast: 'تمت إعادة موضع أداة شريط المهام إلى الافتراضي.'
        }
      );
    });
    $('autoStartToggle').addEventListener('change', (event) => {
      saveSettings(
        { autoLaunch: event.target.checked },
        { toast: event.target.checked ? 'سيبدأ صلاتي مع Windows بعد التثبيت' : 'تم إيقاف التشغيل التلقائي' }
      );
    });

    const updatePill = $('updatePill');
    if (updatePill) updatePill.addEventListener('click', handleUpdatePillClick);

    $('volumeRange').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      $('volumeValue').textContent = `${value}%`;
      clearTimeout(state.volumeTimer);
      state.volumeTimer = setTimeout(() => {
        saveSettings({ volume: value / 100 });
      }, 300);
    });

    $('soundSelect').addEventListener('change', async (event) => {
      const sound = event.target.value;
      if (sound === 'custom' && !state.settings?.customSoundPath) {
        const picked = await pickSound();
        if (!picked) syncSettingsUI();
        return;
      }
      saveSettings({ sound });
    });

    $('pickSoundBtn').addEventListener('click', pickSound);
    $('previewSound').addEventListener('click', previewSound);
    $('stopAdhan').addEventListener('click', () => {
      stopAudio();
      hideAdhanBanner();
    });

    $('detectBtn').addEventListener('click', (event) => detectLocation(event.currentTarget));

    $('citySearch').addEventListener('input', (event) => {
      const value = event.target.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => runSearch(value), 380);
    });
    $('citySearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && state.searchResults.length) {
        event.preventDefault();
        selectCity(state.searchResults[0]);
      }
      if (event.key === 'Escape') {
        $('cityResults').hidden = true;
      }
    });
    $('cityResults').addEventListener('click', (event) => {
      if (event.target.closest('.city-result')) {
        $('cityResults').hidden = true;
      }
    });

    $('resetBtn').addEventListener('click', async () => {
      if (!window.confirm('هل تريد استعادة الإعدادات الافتراضية؟ سيتم الاحتفاظ بموقعك الحالي.')) return;
      try {
        const response = await api.resetSettings();
        state.settings = response.settings;
        applyTheme();
        syncSettingsUI();
        await refreshToday();
        initMonthState();
        state.month.data = null;
        if (state.view === 'month') {
          await loadMonth(state.month.year, state.month.month, { scroll: 'today' });
        }
        showToast('تمت استعادة الإعدادات الافتراضية.');
      } catch {
        showToast('تعذّر استعادة الإعدادات.');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        $('cityResults').hidden = true;
        closeThemeMenu();
        if ($('focusOverlay').hidden === false) hideFocusOverlay();
      }
    });

    setInterval(() => {
      updateCountdown();
      updateFocusCountdown();
      watchDay();
    }, 1000);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    api.onPlayAdhan(handleAdhan);
    api.onFocusShow(showFocusOverlay);
    api.onFocusHide(() => hideFocusOverlay(true));
    api.onSettingsChanged(applyExternalSettings);
    api.onToast((payload) => {
      if (payload?.message) showToast(payload.message);
    });
    api.onNavigate((view) => {
      switchView(view || 'home');
    });
    api.onThemeChanged(() => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    document.addEventListener(
      'pointerdown',
      () => {
        if (state.audioCtx?.state === 'suspended') state.audioCtx.resume();
      },
      { once: true }
    );
  }

  function watchDay() {
    if (!state.settings || !state.today) return;
    const parts = cityDateParts(new Date(), timeZone());
    if (dateKey(parts) !== state.today.dateKey) {
      renderDates();
      refreshToday();
      if (state.month.data) {
        const now = currentMonth();
        if (now.year !== state.month.data.year || now.month !== state.month.data.month) {
          loadMonth(now.year, now.month, { silent: true });
        } else {
          renderMonth();
        }
      }
    }
  }

  async function pickSound() {
    try {
      const result = await api.pickSound();
      if (!result) return false;
      await saveSettings(
        { customSoundPath: result.path, sound: 'custom' },
        { toast: 'تم اختيار ملف الأذان.' }
      );
      return true;
    } catch {
      showToast('تعذّر اختيار الملف.');
      return false;
    }
  }

  async function testNotification() {
    try {
      const ok = await api.testNotification();
      if (!ok) showToast('التنبيهات غير مدعومة على هذا الجهاز.');
    } catch {
      showToast('تعذّر إظهار التنبيه التجريبي.');
    }
  }

  /* ---------------- البدء ---------------- */

  async function init() {
    bindEvents();

    const failsafe = setTimeout(hideSplash, 6000);

    try {
      const { settings, meta } = await api.getSettings();
      state.settings = settings;
      state.meta = meta;
      setUpdatePillVersion(meta.version);
      applyTheme();
      syncSettingsUI();
      initMonthState();

      if (api.onUpdaterState) api.onUpdaterState(renderUpdaterState);
      if (api.getUpdaterState) {
        try {
          renderUpdaterState(await api.getUpdaterState());
        } catch {}
      }

      await refreshToday();
      renderDates();
      if (state.settings.notifications === false) renderNotificationStatus();

      setTimeout(hideSplash, 450);
    } catch (error) {
      console.error(error);
      hideSplash();
      showToast('تعذّر تحميل بيانات التطبيق. أعد تشغيل صلاتي.');
    } finally {
      clearTimeout(failsafe);
    }
  }

  init();
})();