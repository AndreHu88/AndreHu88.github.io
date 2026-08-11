(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.JackMealData = data;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var definitions = {
    themes: [
      { value: 'rice-friendly', label: '家常下饭', shortLabel: '下饭', icon: 'rice_bowl' },
      { value: 'light', label: '清淡少油', shortLabel: '清淡', icon: 'eco' },
      { value: 'quick', label: '快手省事', shortLabel: '快手', icon: 'timer' },
      { value: 'high-protein', label: '高蛋白', shortLabel: '高蛋白', icon: 'fitness_center' },
      { value: 'banquet', label: '宴客硬菜', shortLabel: '宴客', icon: 'celebration' }
    ],
    styles: [
      { value: 'stir-fry', label: '炒菜' }, { value: 'braised', label: '红烧焖卤' },
      { value: 'steamed', label: '蒸菜' }, { value: 'stew', label: '炖煲' },
      { value: 'fried-grilled', label: '煎炸烧烤' }, { value: 'cold', label: '凉拌冷盘' }
    ],
    spice: [
      { value: 'none', label: '不辣', rank: 0 }, { value: 'mild', label: '微辣', rank: 1 },
      { value: 'medium', label: '中辣', rank: 2 }, { value: 'hot', label: '重辣', rank: 3 }
    ],
    difficulty: [
      { value: 'easy', label: '简单' }, { value: 'medium', label: '适中' }, { value: 'hard', label: '较难' }
    ],
    ingredients: {
      pork: { label: '猪肉', aliases: ['猪', '猪肉', '排骨', '五花肉'], avoidTag: 'pork', proteinGroup: 'pork' },
      beef: { label: '牛肉', aliases: ['牛', '牛肉', '牛腩'], avoidTag: 'beef', proteinGroup: 'beef' },
      lamb: { label: '羊肉', aliases: ['羊', '羊肉', '羊排'], avoidTag: 'lamb', proteinGroup: 'lamb' },
      chicken: { label: '鸡肉', aliases: ['鸡', '鸡肉', '鸡翅', '鸡腿'], proteinGroup: 'poultry' },
      duck: { label: '鸭肉', aliases: ['鸭', '鸭肉'], proteinGroup: 'poultry' },
      fish: { label: '鱼', aliases: ['鱼', '鱼肉'], avoidTag: 'seafood', proteinGroup: 'seafood' },
      shrimp: { label: '虾', aliases: ['虾', '虾仁'], avoidTag: 'seafood', proteinGroup: 'seafood' },
      shellfish: { label: '贝类', aliases: ['贝类', '蛤蜊', '扇贝', '生蚝'], avoidTag: 'seafood', proteinGroup: 'seafood' },
      squid: { label: '鱿鱼', aliases: ['鱿鱼', '墨鱼'], avoidTag: 'seafood', proteinGroup: 'seafood' },
      seafood: { label: '海鲜', aliases: ['海鲜', '水产'], avoidTag: 'seafood', proteinGroup: 'seafood' },
      egg: { label: '蛋类', aliases: ['蛋', '鸡蛋', '蛋类'], avoidTag: 'egg', proteinGroup: 'egg' },
      tofu: { label: '豆腐', aliases: ['豆腐', '豆制品', '大豆'], avoidTag: 'soy', proteinGroup: 'soy' },
      mushroom: { label: '菌菇', aliases: ['蘑菇', '香菇', '菌菇', '口蘑'], proteinGroup: 'mushroom' },
      potato: { label: '土豆', aliases: ['土豆', '马铃薯'] }, tomato: { label: '番茄', aliases: ['番茄', '西红柿'] },
      eggplant: { label: '茄子', aliases: ['茄子'] }, pepper: { label: '辣椒', aliases: ['辣椒', '青椒', '尖椒'] },
      cabbage: { label: '白菜包菜', aliases: ['白菜', '包菜', '卷心菜'] }, broccoli: { label: '西兰花', aliases: ['西兰花'] },
      greens: { label: '绿叶菜', aliases: ['青菜', '生菜', '油麦菜', '空心菜'] }, bean: { label: '豆角', aliases: ['豆角', '四季豆'] },
      root: { label: '根茎菜', aliases: ['萝卜', '山药', '莲藕'] }, corn: { label: '玉米', aliases: ['玉米'] },
      pumpkin: { label: '南瓜', aliases: ['南瓜'] }, cucumber: { label: '黄瓜', aliases: ['黄瓜'] },
      celery: { label: '芹菜', aliases: ['芹菜', '西芹'] }, bamboo: { label: '笋', aliases: ['笋', '竹笋', '莴笋'] },
      seaweed: { label: '海带紫菜', aliases: ['海带', '紫菜'] }, peanut: { label: '花生坚果', aliases: ['花生', '坚果'], avoidTag: 'peanut' },
      dairy: { label: '奶制品', aliases: ['奶', '奶油', '芝士'], avoidTag: 'dairy' }, gluten: { label: '面筋麸质', aliases: ['面粉', '面筋', '麸质'], avoidTag: 'gluten' }
    }
  };

  var dishes = [];
  var allDining = ['cook', 'takeout', 'dine-in'];

  function price(cookLow, cookHigh, takeoutLow, takeoutHigh, dineLow, dineHigh) {
    return { cook: [cookLow, cookHigh], takeout: [takeoutLow, takeoutHigh], 'dine-in': [dineLow, dineHigh] };
  }

  function addGroup(group) {
    group.items.forEach(function (item) {
      var overrides = item[3] || {};
      var ingredients = item[2].slice();
      var avoidTags = (overrides.avoidTags || []).slice();
      ingredients.forEach(function (ingredient) {
        var definition = definitions.ingredients[ingredient];
        if (definition && definition.avoidTag && avoidTags.indexOf(definition.avoidTag) < 0) avoidTags.push(definition.avoidTag);
      });
      dishes.push({
        id: item[0], name: item[1], diet: overrides.diet || group.diet,
        role: overrides.role || group.role, course: overrides.course || group.course,
        style: overrides.style || group.style, wet: overrides.wet === undefined ? group.wet : overrides.wet,
        spice: overrides.spice || group.spice, themes: (overrides.themes || group.themes).slice(),
        primaryIngredients: ingredients, avoidTags: avoidTags,
        dining: (overrides.dining || group.dining || allDining).slice(),
        prices: overrides.prices || group.prices,
        cookMinutes: overrides.cookMinutes || group.cookMinutes,
        difficulty: overrides.difficulty || group.difficulty
      });
    });
  }

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'stir-fry', wet: false, spice: 'none', themes: ['rice-friendly', 'quick', 'high-protein'], prices: price(12, 20, 24, 38, 28, 48), cookMinutes: 20, difficulty: 'easy', items: [
    ['pepper-pork-shreds', '青椒肉丝', ['pork', 'pepper']], ['mushroom-pork-shreds', '香菇肉片', ['pork', 'mushroom']],
    ['mushu-pork', '木须肉', ['pork', 'egg']], ['garlic-sprout-pork', '蒜薹炒肉', ['pork', 'greens']],
    ['celery-beef', '芹菜炒牛肉', ['beef', 'celery']], ['black-pepper-beef', '黑椒牛柳', ['beef', 'pepper']],
    ['onion-beef', '洋葱炒牛肉', ['beef']], ['scallion-lamb', '葱爆羊肉', ['lamb']],
    ['celery-squid', '西芹炒鱿鱼', ['squid', 'celery']], ['shrimp-scrambled-eggs', '虾仁滑蛋', ['shrimp', 'egg']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'stir-fry', wet: false, spice: 'mild', themes: ['rice-friendly', 'quick', 'high-protein'], prices: price(13, 22, 25, 40, 30, 52), cookMinutes: 22, difficulty: 'easy', items: [
    ['fish-fragrant-pork', '鱼香肉丝', ['pork']], ['kung-pao-chicken', '宫保鸡丁', ['chicken', 'peanut']],
    ['twice-cooked-pork', '回锅肉', ['pork', 'pepper']], ['pepper-fried-pork', '辣椒炒肉', ['pork', 'pepper']],
    ['spicy-chicken-gizzard', '麻辣鸡杂', ['chicken', 'pepper']], ['pickled-pepper-beef', '泡椒牛肉', ['beef', 'pepper']],
    ['cumin-beef', '孜然牛肉', ['beef']], ['spicy-shrimp', '香辣虾', ['shrimp', 'pepper']],
    ['dry-pot-chicken', '干锅鸡', ['chicken', 'pepper']], ['spicy-squid', '香辣鱿鱼', ['squid', 'pepper']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'braised', wet: false, spice: 'none', themes: ['rice-friendly', 'high-protein', 'banquet'], prices: price(18, 32, 32, 55, 42, 72), cookMinutes: 45, difficulty: 'medium', items: [
    ['red-braised-pork', '红烧肉', ['pork']], ['cola-chicken-wings', '可乐鸡翅', ['chicken']],
    ['potato-braised-chicken', '土豆烧鸡', ['chicken', 'potato']], ['sweet-sour-ribs', '糖醋排骨', ['pork']],
    ['soy-braised-ribs', '红烧排骨', ['pork']], ['chestnut-chicken', '板栗烧鸡', ['chicken']],
    ['soy-braised-duck', '酱烧鸭', ['duck']], ['lion-head-meatballs', '红烧狮子头', ['pork']],
    ['plum-vegetable-pork', '梅菜扣肉', ['pork']], ['braised-pork-trotter', '红烧猪蹄', ['pork']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'braised', wet: true, spice: 'mild', themes: ['rice-friendly', 'high-protein'], prices: price(18, 30, 30, 52, 38, 68), cookMinutes: 40, difficulty: 'medium', items: [
    ['yellow-braised-chicken', '黄焖鸡', ['chicken']], ['beer-duck', '啤酒鸭', ['duck']],
    ['curry-beef-brisket', '咖喱牛腩', ['beef', 'potato']], ['soy-braised-fish', '红烧鱼块', ['fish']],
    ['spicy-braised-pork', '香辣焖肉', ['pork', 'pepper']], ['braised-chicken-mushroom', '香菇焖鸡', ['chicken', 'mushroom']],
    ['braised-duck-potato', '土豆焖鸭', ['duck', 'potato']], ['soy-braised-beef-tendon', '红烧牛筋', ['beef']],
    ['braised-pork-bamboo', '笋干烧肉', ['pork', 'bamboo']], ['soy-braised-lamb', '红焖羊肉', ['lamb']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'steamed', wet: false, spice: 'none', themes: ['light', 'high-protein', 'banquet'], prices: price(20, 38, 38, 68, 52, 98), cookMinutes: 30, difficulty: 'medium', items: [
    ['steamed-sea-bass', '清蒸鲈鱼', ['fish']], ['steamed-grouper', '清蒸石斑鱼', ['fish']],
    ['garlic-vermicelli-shrimp', '蒜蓉粉丝虾', ['shrimp', 'gluten']], ['steamed-ribs-black-bean', '豉汁蒸排骨', ['pork']],
    ['steamed-chicken-mushroom', '香菇蒸鸡', ['chicken', 'mushroom']], ['steamed-egg-clams', '蛤蜊蒸蛋', ['shellfish', 'egg']],
    ['steamed-turbot', '清蒸多宝鱼', ['fish']], ['steamed-pork-patty', '咸蛋蒸肉饼', ['pork', 'egg']],
    ['steamed-chicken-cordyceps', '虫草花蒸鸡', ['chicken']], ['steamed-scallops', '蒜蓉蒸扇贝', ['shellfish']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'steamed', wet: false, spice: 'mild', themes: ['rice-friendly', 'high-protein', 'banquet'], prices: price(18, 34, 36, 64, 48, 88), cookMinutes: 32, difficulty: 'medium', items: [
    ['chopped-pepper-fish-head', '剁椒鱼头', ['fish', 'pepper']], ['steamed-pork-garlic', '蒜香蒸排骨', ['pork']],
    ['steamed-chicken-chili', '剁椒蒸鸡', ['chicken', 'pepper']], ['steamed-fish-black-bean', '豉椒蒸鱼', ['fish', 'pepper']],
    ['steamed-beef-enoki', '金针菇蒸牛肉', ['beef', 'mushroom']], ['steamed-shrimp-chili', '剁椒蒸虾', ['shrimp', 'pepper']],
    ['steamed-pork-pumpkin', '南瓜蒸排骨', ['pork', 'pumpkin']], ['steamed-squid-garlic', '蒜蓉蒸鱿鱼', ['squid']],
    ['steamed-duck-taro', '芋头蒸鸭', ['duck', 'root']], ['steamed-fish-pickled', '酸菜蒸鱼', ['fish']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'stew', wet: true, spice: 'none', themes: ['rice-friendly', 'high-protein', 'banquet'], prices: price(22, 42, 40, 72, 55, 108), cookMinutes: 60, difficulty: 'medium', items: [
    ['potato-beef-stew', '土豆炖牛肉', ['beef', 'potato']], ['tomato-beef-brisket', '番茄牛腩', ['beef', 'tomato']],
    ['radish-pork-ribs', '萝卜炖排骨', ['pork', 'root']], ['mushroom-chicken-pot', '菌菇炖鸡', ['chicken', 'mushroom']],
    ['abalone-chicken-pot', '鲍鱼鸡煲', ['shellfish', 'chicken']], ['lamb-radish-pot', '羊肉萝卜煲', ['lamb', 'root']],
    ['fish-tofu-pot', '鱼头豆腐煲', ['fish', 'tofu']], ['duck-bamboo-pot', '笋干老鸭煲', ['duck', 'bamboo']],
    ['pork-corn-stew', '玉米炖排骨', ['pork', 'corn']], ['beef-tomato-pot', '番茄土豆牛腩煲', ['beef', 'tomato', 'potato']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'stew', wet: true, spice: 'hot', themes: ['rice-friendly', 'high-protein', 'banquet'], prices: price(22, 40, 42, 78, 58, 118), cookMinutes: 45, difficulty: 'medium', items: [
    ['pickled-fish', '酸菜鱼', ['fish', 'pepper']], ['boiled-beef-chili', '水煮牛肉', ['beef', 'pepper']],
    ['spicy-blood-curd', '毛血旺', ['pork', 'pepper']], ['boiled-fish-chili', '水煮鱼', ['fish', 'pepper']],
    ['spicy-chicken-pot', '麻辣鸡煲', ['chicken', 'pepper']], ['pickled-pepper-frog', '泡椒牛蛙', ['pepper']],
    ['spicy-beef-pot', '麻辣牛肉煲', ['beef', 'pepper']], ['spicy-shrimp-pot', '香辣虾煲', ['shrimp', 'pepper']],
    ['spicy-duck-blood', '麻辣鸭血煲', ['duck', 'pepper']], ['sour-soup-fish', '酸汤鱼', ['fish', 'pepper']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'fried-grilled', wet: false, spice: 'none', themes: ['high-protein', 'banquet'], prices: price(20, 38, 38, 68, 52, 98), cookMinutes: 40, difficulty: 'medium', items: [
    ['salt-baked-chicken', '盐焗鸡', ['chicken']], ['sweet-sour-pork', '糖醋里脊', ['pork']],
    ['honey-char-siu', '蜜汁叉烧', ['pork']], ['pan-fried-cod', '香煎鳕鱼', ['fish']],
    ['herb-lamb-chops', '香草烤羊排', ['lamb']], ['pan-fried-chicken', '香煎鸡排', ['chicken']],
    ['fried-hairtail', '香酥带鱼', ['fish']], ['crispy-chicken', '脆皮鸡', ['chicken']],
    ['grilled-pork-ribs', '蜜汁烤排骨', ['pork']], ['pan-fried-shrimp-cakes', '香煎虾饼', ['shrimp']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'fried-grilled', wet: false, spice: 'medium', themes: ['rice-friendly', 'high-protein', 'banquet'], prices: price(20, 38, 40, 72, 55, 105), cookMinutes: 38, difficulty: 'medium', items: [
    ['spicy-grilled-fish', '香辣烤鱼', ['fish', 'pepper']], ['cumin-lamb', '孜然羊肉', ['lamb']],
    ['spicy-fried-chicken', '辣子鸡', ['chicken', 'pepper']], ['pepper-salt-shrimp', '椒盐虾', ['shrimp']],
    ['pepper-salt-squid', '椒盐鱿鱼', ['squid']], ['cumin-pork-ribs', '孜然排骨', ['pork']],
    ['spicy-grilled-wings', '香辣烤鸡翅', ['chicken', 'pepper']], ['black-pepper-lamb', '黑椒羊排', ['lamb']],
    ['fried-fish-chili', '香辣酥鱼', ['fish', 'pepper']], ['grilled-beef-skewers', '孜然牛肉串', ['beef']]
  ] });

  addGroup({ diet: 'meat', role: 'side', course: 'hot', style: 'stir-fry', wet: false, spice: 'none', themes: ['rice-friendly', 'quick', 'high-protein'], prices: price(10, 18, 20, 32, 24, 40), cookMinutes: 18, difficulty: 'easy', items: [
    ['minced-pork-eggplant', '肉末茄子', ['pork', 'eggplant']], ['minced-pork-tofu', '肉末豆腐', ['pork', 'tofu']],
    ['pork-dried-tofu', '香干炒肉', ['pork', 'tofu']], ['pork-lettuce-stem', '青笋炒肉片', ['pork', 'bamboo']],
    ['ham-snow-peas', '火腿炒荷兰豆', ['pork', 'bean']], ['minced-pork-beans', '肉末四季豆', ['pork', 'bean']],
    ['chicken-broccoli', '鸡丁炒西兰花', ['chicken', 'broccoli']], ['beef-mushroom', '牛肉炒口蘑', ['beef', 'mushroom']],
    ['shrimp-broccoli', '虾仁西兰花', ['shrimp', 'broccoli']], ['pork-cabbage', '肉片炒白菜', ['pork', 'cabbage']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'main', course: 'hot', style: 'stir-fry', wet: false, spice: 'none', themes: ['rice-friendly', 'quick', 'high-protein'], prices: price(8, 15, 16, 28, 20, 36), cookMinutes: 18, difficulty: 'easy', items: [
    ['tomato-eggs', '番茄炒蛋', ['tomato', 'egg']], ['mushroom-eggs', '菌菇炒蛋', ['mushroom', 'egg']],
    ['chive-eggs', '韭菜炒蛋', ['greens', 'egg']], ['tofu-pepper', '青椒炒豆腐', ['tofu', 'pepper']],
    ['home-style-tofu', '家常豆腐', ['tofu']], ['tofu-mushroom', '豆腐炒菌菇', ['tofu', 'mushroom']],
    ['egg-cucumber', '黄瓜炒蛋', ['egg', 'cucumber']], ['egg-loofah', '丝瓜炒蛋', ['egg', 'greens']],
    ['egg-shrimp-free', '木耳炒蛋', ['egg', 'mushroom']], ['tofu-celery', '芹菜香干', ['tofu', 'celery']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'main', course: 'hot', style: 'braised', wet: false, spice: 'none', themes: ['rice-friendly', 'high-protein'], prices: price(9, 17, 18, 30, 22, 40), cookMinutes: 28, difficulty: 'easy', items: [
    ['braised-tofu', '红烧豆腐', ['tofu']], ['braised-eggplant', '红烧茄子', ['eggplant']],
    ['mushroom-tofu', '香菇烧豆腐', ['tofu', 'mushroom']], ['soy-sauce-gluten', '红烧面筋', ['gluten']],
    ['braised-winter-melon', '红烧冬瓜', ['root']], ['chestnut-pumpkin', '板栗烧南瓜', ['pumpkin']],
    ['soy-braised-potato', '酱烧土豆', ['potato']], ['braised-mushroom', '红烧双菇', ['mushroom']],
    ['braised-tofu-skin', '红烧腐竹', ['tofu']], ['braised-lotus-root', '酱烧藕片', ['root']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'main', course: 'hot', style: 'stew', wet: true, spice: 'none', themes: ['light', 'high-protein', 'banquet'], prices: price(10, 20, 20, 34, 25, 45), cookMinutes: 35, difficulty: 'easy', items: [
    ['mushroom-tofu-pot', '菌菇豆腐煲', ['mushroom', 'tofu']], ['cabbage-tofu-pot', '白菜豆腐煲', ['cabbage', 'tofu']],
    ['tomato-tofu-pot', '番茄豆腐煲', ['tomato', 'tofu']], ['pumpkin-tofu-pot', '南瓜豆腐煲', ['pumpkin', 'tofu']],
    ['mixed-mushroom-pot', '什锦菌菇煲', ['mushroom']], ['radish-tofu-pot', '萝卜豆腐煲', ['root', 'tofu']],
    ['corn-tofu-pot', '玉米豆腐煲', ['corn', 'tofu']], ['seaweed-tofu-pot', '海带豆腐煲', ['seaweed', 'tofu']],
    ['yam-mushroom-pot', '山药菌菇煲', ['root', 'mushroom']], ['vegetable-clay-pot', '田园蔬菜煲', ['greens', 'mushroom']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'side', course: 'hot', style: 'stir-fry', wet: false, spice: 'none', themes: ['light', 'quick'], prices: price(6, 13, 14, 24, 18, 32), cookMinutes: 15, difficulty: 'easy', items: [
    ['mushroom-greens', '香菇青菜', ['mushroom', 'greens']], ['seasonal-greens', '清炒时蔬', ['greens']],
    ['garlic-broccoli', '蒜蓉西兰花', ['broccoli']], ['oyster-lettuce', '蚝油生菜', ['greens']],
    ['yam-wood-ear', '山药炒木耳', ['root', 'mushroom']], ['lotus-vegetables', '荷塘小炒', ['root', 'bean']],
    ['broccoli-mushroom', '西兰花炒口蘑', ['broccoli', 'mushroom']], ['asparagus-lily', '芦笋炒百合', ['greens', 'root']],
    ['garlic-water-spinach', '蒜蓉空心菜', ['greens']], ['stir-fried-lettuce', '清炒油麦菜', ['greens']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'side', course: 'hot', style: 'stir-fry', wet: false, spice: 'mild', themes: ['rice-friendly', 'quick'], prices: price(7, 14, 15, 26, 19, 35), cookMinutes: 18, difficulty: 'easy', items: [
    ['dry-fried-beans', '干煸四季豆', ['bean']], ['sour-spicy-potato', '酸辣土豆丝', ['potato', 'pepper']],
    ['hand-torn-cabbage', '手撕包菜', ['cabbage', 'pepper']], ['tiger-skin-pepper', '虎皮青椒', ['pepper']],
    ['spicy-lotus-root', '香辣藕片', ['root', 'pepper']], ['dry-pot-cauliflower', '干锅花菜', ['broccoli', 'pepper']],
    ['fish-fragrant-eggplant', '鱼香茄子', ['eggplant', 'pepper']], ['hot-sour-cabbage', '酸辣白菜', ['cabbage', 'pepper']],
    ['spicy-mushroom', '香辣菌菇', ['mushroom', 'pepper']], ['chili-shredded-tofu', '尖椒干豆腐', ['tofu', 'pepper']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'side', course: 'hot', style: 'steamed', wet: false, spice: 'none', themes: ['light', 'quick'], prices: price(7, 15, 16, 28, 20, 38), cookMinutes: 22, difficulty: 'easy', items: [
    ['steamed-pumpkin', '清蒸南瓜', ['pumpkin']], ['steamed-eggplant-garlic', '蒜蓉蒸茄子', ['eggplant']],
    ['steamed-egg', '家常蒸蛋', ['egg']], ['steamed-tofu-egg', '豆腐蒸蛋', ['tofu', 'egg']],
    ['steamed-yam', '清蒸山药', ['root']], ['steamed-corn', '清蒸玉米', ['corn']],
    ['steamed-baby-cabbage', '蒜蓉蒸娃娃菜', ['cabbage']], ['steamed-mushroom', '清蒸菌菇', ['mushroom']],
    ['steamed-lotus-root', '糯香蒸藕', ['root']], ['steamed-broccoli', '蒸西兰花', ['broccoli']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'side', course: 'cold', style: 'cold', wet: false, spice: 'none', themes: ['light', 'quick'], prices: price(6, 14, 14, 26, 18, 34), cookMinutes: 12, difficulty: 'easy', items: [
    ['cold-cucumber', '凉拌黄瓜', ['cucumber']], ['cold-wood-ear', '凉拌木耳', ['mushroom']],
    ['cold-okra', '凉拌秋葵', ['greens']], ['tofu-salad', '豆腐蔬菜沙拉', ['tofu', 'greens']],
    ['spinach-peanut', '菠菜拌花生', ['greens', 'peanut']], ['cold-lotus-root', '凉拌藕片', ['root']],
    ['cold-kelp', '凉拌海带丝', ['seaweed']], ['sesame-spinach', '麻酱菠菜', ['greens', 'peanut']],
    ['tomato-sugar', '糖拌番茄', ['tomato']], ['cold-bamboo', '凉拌莴笋丝', ['bamboo']]
  ] });

  addGroup({ diet: 'meat', role: 'side', course: 'cold', style: 'cold', wet: false, spice: 'none', themes: ['light', 'quick', 'high-protein', 'banquet'], prices: price(14, 28, 28, 48, 36, 62), cookMinutes: 25, difficulty: 'medium', items: [
    ['white-cut-chicken', '白切鸡', ['chicken']], ['soy-sauce-beef', '酱牛肉', ['beef']],
    ['sliced-pork-garlic', '蒜泥白肉', ['pork']], ['chicken-salad', '鸡丝蔬菜沙拉', ['chicken', 'greens']],
    ['beef-cucumber-salad', '牛肉拌黄瓜', ['beef', 'cucumber']], ['jellyfish-cucumber', '海蜇拌黄瓜', ['shellfish', 'cucumber']],
    ['salt-water-duck', '盐水鸭', ['duck']], ['cold-shrimp', '白灼虾', ['shrimp']],
    ['chicken-wood-ear-salad', '木耳拌鸡丝', ['chicken', 'mushroom']], ['pepper-chicken-cold', '椒麻鸡', ['chicken', 'pepper'], { spice: 'mild' }]
  ] });

  addGroup({ diet: 'meat', role: 'soup', course: 'soup', style: 'stew', wet: true, spice: 'none', themes: ['light', 'high-protein'], prices: price(10, 22, 20, 38, 28, 52), cookMinutes: 45, difficulty: 'easy', items: [
    ['winter-melon-meatball-soup', '冬瓜肉丸汤', ['pork', 'root']], ['corn-rib-soup', '玉米排骨汤', ['pork', 'corn']],
    ['tomato-beef-soup', '番茄牛肉汤', ['beef', 'tomato']], ['mushroom-chicken-soup', '菌菇鸡汤', ['chicken', 'mushroom']],
    ['radish-lamb-soup', '萝卜羊肉汤', ['lamb', 'root']], ['fish-tofu-soup', '鲫鱼豆腐汤', ['fish', 'tofu']],
    ['seaweed-egg-drop-soup', '紫菜蛋花汤', ['seaweed', 'egg']], ['clam-winter-melon-soup', '蛤蜊冬瓜汤', ['shellfish', 'root']],
    ['lotus-root-rib-soup', '莲藕排骨汤', ['pork', 'root']], ['yam-chicken-soup', '山药鸡汤', ['chicken', 'root']]
  ] });

  addGroup({ diet: 'vegetarian', role: 'soup', course: 'soup', style: 'stew', wet: true, spice: 'none', themes: ['light', 'quick'], prices: price(6, 15, 14, 28, 18, 36), cookMinutes: 25, difficulty: 'easy', items: [
    ['winter-melon-kelp-soup', '冬瓜海带汤', ['root', 'seaweed']], ['mushroom-vegetable-soup', '菌菇蔬菜汤', ['mushroom', 'greens']],
    ['tomato-egg-soup', '番茄蛋花汤', ['tomato', 'egg']], ['corn-vegetable-soup', '玉米蔬菜汤', ['corn', 'greens']],
    ['tofu-greens-soup', '豆腐青菜汤', ['tofu', 'greens']], ['radish-mushroom-soup', '萝卜菌菇汤', ['root', 'mushroom']],
    ['pumpkin-soup', '南瓜浓汤', ['pumpkin']], ['cabbage-tofu-soup', '白菜豆腐汤', ['cabbage', 'tofu']],
    ['seaweed-tofu-soup', '海带豆腐汤', ['seaweed', 'tofu']], ['loofah-egg-soup', '丝瓜蛋汤', ['greens', 'egg']]
  ] });

  addGroup({ diet: 'meat', role: 'main', course: 'hot', style: 'fried-grilled', wet: false, spice: 'none', themes: ['banquet', 'high-protein'], prices: price(35, 68, 68, 128, 88, 188), cookMinutes: 60, difficulty: 'hard', items: [
    ['lobster-garlic', '蒜蓉焗龙虾', ['shellfish']], ['abalone-braised', '鲍汁扣鲍鱼', ['shellfish']],
    ['black-pepper-steak', '黑椒牛排', ['beef']], ['roast-duck', '脆皮烤鸭', ['duck']],
    ['tea-smoked-duck', '樟茶鸭', ['duck']], ['grilled-eel', '蒲烧鳗鱼', ['fish']],
    ['baked-crab', '芝士焗蟹', ['shellfish', 'dairy']], ['pan-fried-scallops', '香煎带子', ['shellfish']],
    ['roast-lamb-leg', '香烤羊腿', ['lamb']], ['crispy-pigeon', '脆皮乳鸽', ['chicken']]
  ] });

  return { definitions: definitions, dishes: dishes };
}));
