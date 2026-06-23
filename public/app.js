let allClients = [];
let selectedClient = null;
let clientHeaders = [];

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  loadClients();
  setupEventListeners();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}

function setupEventListeners() {
  document.getElementById('client-search').addEventListener('input', filterClients);
  document.getElementById('btn-generate').addEventListener('click', generatePlan);
  document.getElementById('btn-export').addEventListener('click', exportPDF);
  document.getElementById('btn-back').addEventListener('click', () => showStep('step-data'));
}

async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    allClients = data.clients;
    clientHeaders = data.headers;
    document.getElementById('client-search').disabled = false;
    renderClientList(allClients);
  } catch (err) {
    document.getElementById('client-list').innerHTML =
      `<p class="loading" style="color: var(--accent)">Error: ${err.message}</p>`;
  }
}

function filterClients() {
  const query = document.getElementById('client-search').value.toLowerCase();
  const filtered = allClients.filter(c => {
    const name = getClientName(c).toLowerCase();
    const email = getClientEmail(c).toLowerCase();
    return name.includes(query) || email.includes(query);
  });
  renderClientList(filtered);
}

function getClientName(client) {
  const keys = Object.keys(client);
  const nameKey = keys.find(k =>
    k.toLowerCase().includes('name') && !k.toLowerCase().includes('email') && !k.toLowerCase().includes('user')
  );
  if (nameKey && client[nameKey]) return client[nameKey];
  const email = getClientEmail(client);
  if (email) {
    const prefix = email.split('@')[0].replace(/[._0-9]/g, ' ').trim();
    return prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return 'Unknown';
}

function getClientEmail(client) {
  const keys = Object.keys(client);
  const emailKey = keys.find(k =>
    k.toLowerCase().includes('email') || k.toLowerCase().includes('e-mail')
  );
  return emailKey ? client[emailKey] : '';
}

function getClientField(client, ...keywords) {
  const keys = Object.keys(client);
  const key = keys.find(k => {
    const lower = k.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  });
  return key ? client[key] : '';
}

function getClientMealsPerDay(client) {
  const val = getClientField(client, 'how many times', 'meals', 'eat');
  if (val) {
    const num = parseInt(val);
    if (!isNaN(num) && num >= 2 && num <= 8) return num;
    const match = val.match(/\d/);
    if (match) {
      const parsed = parseInt(match[0]);
      if (parsed >= 2 && parsed <= 8) return parsed;
    }
    if (val.toLowerCase().includes('snack')) {
      const mealNum = val.match(/(\d)/);
      return mealNum ? parseInt(mealNum[0]) + 1 : 4;
    }
  }
  return 3;
}

function renderClientList(clients) {
  const container = document.getElementById('client-list');
  if (clients.length === 0) {
    container.innerHTML = '<p class="loading">No clients found</p>';
    return;
  }
  container.innerHTML = clients.map((c) => `
    <div class="client-item" data-index="${allClients.indexOf(c)}">
      <div class="name">${getClientName(c)}</div>
      <div class="email">${getClientEmail(c)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.client-item').forEach(item => {
    item.addEventListener('click', () => selectClient(parseInt(item.dataset.index)));
  });
}

function selectClient(index) {
  selectedClient = allClients[index];
  showStep('step-data');
  displayQuestionnaireSummary();
  prefillFromQuestionnaire();
}

function displayQuestionnaireSummary() {
  const container = document.getElementById('questionnaire-summary');
  const keys = Object.keys(selectedClient).filter(k => k !== '_rowIndex');
  const details = keys.map(k => {
    if (!selectedClient[k]) return '';
    return `<div class="detail"><strong>${k}:</strong> ${selectedClient[k]}</div>`;
  }).filter(Boolean).join('');

  container.innerHTML = `
    <h4>Questionnaire Responses - ${getClientName(selectedClient)}</h4>
    ${details}
  `;
}

function prefillFromQuestionnaire() {
  const mealsPerDay = getClientMealsPerDay(selectedClient);
  document.getElementById('meals-per-day').value = mealsPerDay;

  const keys = Object.keys(selectedClient);

  const goalKey = keys.find(k => k.toLowerCase().includes('goal') || k.toLowerCase().includes('q2'));
  if (goalKey && selectedClient[goalKey]) {
    const goalVal = selectedClient[goalKey].toLowerCase();
    if (goalVal.includes('loss') || goalVal.includes('lose') || goalVal.includes('fat') || goalVal.includes('lean')) {
      document.getElementById('goal').value = 'fat-loss';
    } else if (goalVal.includes('gain') || goalVal.includes('muscle') || goalVal.includes('build') || goalVal.includes('bulk')) {
      document.getElementById('goal').value = 'muscle-gain';
    } else {
      document.getElementById('goal').value = 'maintenance';
    }
  }
}

function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function computeNutrition() {
  const weightLbs = parseFloat(document.getElementById('weight').value);
  const goalWeightLbs = document.getElementById('goal-weight').value;
  const heightIn = parseFloat(document.getElementById('height').value);
  const bodyFat = parseFloat(document.getElementById('body-fat').value) || null;
  const age = parseInt(document.getElementById('age').value);
  const gender = document.getElementById('gender').value;
  const activityLevel = parseFloat(document.getElementById('activity-level').value);
  const goal = document.getElementById('goal').value;
  const mealsPerDay = parseInt(document.getElementById('meals-per-day').value);
  const personalNote = document.getElementById('personal-note').value;

  const weight = weightLbs * 0.453592;
  const goalWeight = goalWeightLbs ? (parseFloat(goalWeightLbs) * 0.453592).toFixed(1) : '';
  const height = heightIn * 2.54;

  let bmr;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const tdee = Math.round(bmr * activityLevel);

  let calorieTarget, goalLabel;
  if (goal === 'fat-loss') {
    calorieTarget = Math.round(tdee - 500);
    goalLabel = 'Fat Loss';
  } else if (goal === 'muscle-gain') {
    calorieTarget = Math.round(tdee + 300);
    goalLabel = 'Muscle Gain';
  } else {
    calorieTarget = tdee;
    goalLabel = 'Maintenance';
  }

  const minCalories = gender === 'male' ? 1400 : 1200;
  if (calorieTarget < minCalories) calorieTarget = minCalories;

  let proteinPerKg, fatPercent;
  if (goal === 'fat-loss') { proteinPerKg = 2.2; fatPercent = 0.25; }
  else if (goal === 'muscle-gain') { proteinPerKg = 2.0; fatPercent = 0.25; }
  else { proteinPerKg = 1.8; fatPercent = 0.3; }

  let proteinBase = weight;
  if (bodyFat && bodyFat > 0 && bodyFat < 100) {
    proteinBase = weight * (1 - bodyFat / 100);
  }

  const proteinGrams = Math.round(proteinBase * proteinPerKg);
  const proteinCals = proteinGrams * 4;
  const fatCals = Math.round(calorieTarget * fatPercent);
  const fatGrams = Math.round(fatCals / 9);
  const carbsCals = Math.max(0, calorieTarget - proteinCals - fatCals);
  const carbsGrams = Math.max(0, Math.round(carbsCals / 4));

  const waterLiters = (weight * 0.033).toFixed(1);

  return {
    weight, goalWeight, height, age, gender, activityLevel, goal, goalLabel,
    weightLbs, goalWeightLbs, heightIn, bodyFat,
    mealsPerDay, personalNote,
    bmr: Math.round(bmr), tdee, calorieTarget,
    proteinGrams, proteinCals, carbsGrams, carbsCals, fatGrams, fatCals,
    waterLiters,
    clientName: getClientName(selectedClient),
  };
}

function generatePlan() {
  const weight = document.getElementById('weight').value;
  const height = document.getElementById('height').value;
  const age = document.getElementById('age').value;
  if (!weight || !height || !age) {
    alert('Please fill in weight, height, and age.');
    return;
  }

  const data = computeNutrition();
  const mealPlan = generateMealPlan(data.mealsPerDay, data.proteinGrams, data.carbsGrams, data.fatGrams, data.calorieTarget, data.goal);
  const tips = generateTips(data.goal, selectedClient);
  const foodList = getFoodList(data);
  const groceryList = getWeeklyGroceryList(data);
  const mealTiming = getMealTiming(data.mealsPerDay, selectedClient);
  const workoutNutrition = getWorkoutNutrition(data.goal, selectedClient);
  const foodsToAvoid = getFoodsToAvoid(data.goal, selectedClient);
  const progressNote = getProgressNote(data.goal, data.weight);

  const planHTML = buildPlanHTML({
    ...data, mealPlan, tips, foodList, groceryList,
    mealTiming, workoutNutrition, foodsToAvoid, progressNote,
  });

  document.getElementById('nutrition-plan').innerHTML = planHTML;
  showStep('step-plan');
}

function generateMealPlan(mealsPerDay, totalProtein, totalCarbs, totalFats, totalCals, goal) {
  const meals = [];
  const mealNames = getMealNames(mealsPerDay);
  const distributions = getMealDistributions(mealsPerDay);

  for (let i = 0; i < mealsPerDay; i++) {
    const dist = distributions[i];
    const mealProtein = Math.round(totalProtein * dist);
    const mealCarbs = Math.round(totalCarbs * dist);
    const mealFats = Math.round(totalFats * dist);
    const mealCals = Math.round(totalCals * dist);

    const options = getMealOptions(i, mealsPerDay, mealProtein, mealCarbs, mealFats, goal);

    meals.push({
      name: mealNames[i],
      protein: mealProtein,
      carbs: mealCarbs,
      fats: mealFats,
      calories: mealCals,
      optionA: options[0],
      optionB: options[1],
      optionC: options[2],
    });
  }
  return meals;
}

function getMealNames(count) {
  if (count === 2) return ['Meal 1 (Brunch)', 'Meal 2 (Dinner)'];
  if (count === 3) return ['Breakfast', 'Lunch', 'Dinner'];
  if (count === 4) return ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
  if (count === 5) return ['Breakfast', 'Mid-Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner'];
  if (count === 6) return ['Breakfast', 'Mid-Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack'];
  return ['Breakfast', 'Lunch', 'Dinner'];
}

function getMealDistributions(count) {
  if (count === 2) return [0.45, 0.55];
  if (count === 3) return [0.3, 0.35, 0.35];
  if (count === 4) return [0.25, 0.3, 0.15, 0.3];
  if (count === 5) return [0.25, 0.1, 0.3, 0.1, 0.25];
  if (count === 6) return [0.2, 0.1, 0.25, 0.1, 0.25, 0.1];
  return [0.3, 0.35, 0.35];
}

function getMealOptions(mealIndex, totalMeals, protein, carbs, fats, goal) {
  const isBreakfast = mealIndex === 0;
  const isDinner = mealIndex === totalMeals - 1;
  const isLunch = (totalMeals <= 4 && mealIndex === 1) || (totalMeals >= 5 && mealIndex === 2);
  const isSnack = !isBreakfast && !isDinner && !isLunch;

  if (totalMeals === 2) {
    if (mealIndex === 0) return getBrunchOptions(protein, carbs, fats);
    return getLargeDinnerOptions(protein, carbs, fats);
  }
  if (isBreakfast) return getBreakfastOptions(protein, carbs, fats);
  if (isLunch) return getLunchOptions(protein, carbs, fats);
  if (isDinner) return getDinnerOptions(protein, carbs, fats);
  return getSnackOptions(protein, carbs, fats);
}

function getBreakfastOptions(p, c, f) {
  return [
    {
      title: 'Egg White Oatmeal Bowl',
      ingredients: [
        `${Math.max(4, Math.round(p * 0.5 / 3.6))} egg whites`,
        '1 whole egg',
        `${Math.round(c * 0.6 / 0.6)}g rolled oats (dry)`,
        '1/2 cup mixed berries',
        `${Math.round(f * 0.3 / 5)}g almonds, sliced`,
        'Pinch of cinnamon',
      ],
      instructions: [
        'Cook oats with water according to package directions.',
        'Scramble egg whites and whole egg in a nonstick pan with cooking spray.',
        'Top oats with berries and sliced almonds.',
        'Serve eggs on the side or on top. Add cinnamon to taste.',
      ],
    },
    {
      title: 'Greek Yogurt Protein Parfait',
      ingredients: [
        `${Math.round(p * 0.6 / 0.1)}g nonfat Greek yogurt`,
        '1 scoop vanilla protein powder (optional, for extra protein)',
        `${Math.round(c * 0.5 / 0.7)}g granola (low sugar)`,
        '1/2 cup strawberries, sliced',
        '1 tbsp honey',
        `${Math.round(f * 0.4 / 6)}g walnuts, chopped`,
      ],
      instructions: [
        'Mix Greek yogurt with protein powder if using.',
        'Layer yogurt, granola, and strawberries in a glass or bowl.',
        'Top with chopped walnuts and drizzle honey.',
        'Serve immediately or prep the night before (add granola in the morning).',
      ],
    },
    {
      title: 'Avocado Toast with Eggs',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.5 / 6))} whole eggs`,
        `${Math.round(c * 0.5 / 12)}g whole grain bread (sliced)`,
        `${Math.round(f * 0.5 / 1.5)}g avocado`,
        'Cherry tomatoes, halved',
        'Salt, pepper, red pepper flakes',
        '1 tsp lemon juice',
      ],
      instructions: [
        'Toast bread until golden and crispy.',
        'Mash avocado with lemon juice, salt, and pepper.',
        'Fry or poach eggs to your preference.',
        'Spread avocado on toast, top with eggs and cherry tomatoes. Season with red pepper flakes.',
      ],
    },
  ];
}

function getLunchOptions(p, c, f) {
  return [
    {
      title: 'Grilled Chicken Rice Bowl',
      ingredients: [
        `${Math.round(p / 0.31 * 0.85)}g chicken breast`,
        `${Math.round(c * 0.6 / 0.28)}g cooked brown rice`,
        '1 cup steamed broccoli',
        '1/2 cup bell peppers, diced',
        `${Math.round(f * 0.5 / 4.5)} tsp olive oil`,
        'Salt, pepper, garlic powder',
        'Squeeze of lemon juice',
      ],
      instructions: [
        'Season chicken breast with salt, pepper, and garlic powder.',
        'Grill or pan-sear chicken for 5-6 minutes per side until cooked through.',
        'Steam broccoli until tender-crisp, about 3-4 minutes.',
        'Serve chicken sliced over brown rice with veggies. Drizzle olive oil and lemon.',
      ],
    },
    {
      title: 'Turkey Lettuce Wraps with Quinoa',
      ingredients: [
        `${Math.round(p / 0.29 * 0.85)}g ground turkey (93% lean)`,
        `${Math.round(c * 0.5 / 0.21)}g cooked quinoa`,
        '4-5 large butter lettuce leaves',
        '1/4 cup diced tomatoes',
        '2 tbsp diced onion',
        `${Math.round(f * 0.4 / 4.5)} tsp avocado oil`,
        '1 tsp soy sauce or coconut aminos',
      ],
      instructions: [
        'Cook ground turkey in a skillet with avocado oil over medium heat, breaking apart.',
        'Add soy sauce and cook until browned, about 6-8 minutes.',
        'Warm quinoa and divide among lettuce leaves.',
        'Top each wrap with turkey, tomatoes, and onion. Fold and serve.',
      ],
    },
    {
      title: 'Tuna Salad Power Bowl',
      ingredients: [
        `${Math.round(p / 0.26)}g canned tuna (in water, drained)`,
        `${Math.round(c * 0.5 / 0.2)}g sweet potato, cubed and roasted`,
        '2 cups mixed greens',
        '1/4 cup cucumber, diced',
        '1/4 cup cherry tomatoes, halved',
        `${Math.round(f * 0.5 / 4.5)} tsp olive oil`,
        '1 tbsp balsamic vinegar',
      ],
      instructions: [
        'Cube sweet potato, toss with a little oil, and roast at 400F for 20 minutes.',
        'Drain tuna and flake into a bowl.',
        'Arrange mixed greens, top with sweet potato, cucumber, and tomatoes.',
        'Add tuna on top. Drizzle with olive oil and balsamic vinegar.',
      ],
    },
  ];
}

function getDinnerOptions(p, c, f) {
  return [
    {
      title: 'Baked Salmon with Sweet Potato',
      ingredients: [
        `${Math.round(p / 0.25 * 0.8)}g salmon fillet`,
        `${Math.round(c * 0.6 / 0.2)}g sweet potato`,
        '1.5 cups steamed asparagus',
        `${Math.round(f * 0.3 / 4.5)} tsp olive oil`,
        'Lemon, dill, salt, and pepper',
      ],
      instructions: [
        'Preheat oven to 400F (200C).',
        'Pierce sweet potato with a fork. Microwave 5-6 min or bake 40 min until tender.',
        'Season salmon with olive oil, lemon juice, dill, salt, and pepper.',
        'Bake salmon on a lined sheet for 12-15 minutes.',
        'Steam asparagus 3-4 min. Plate everything together.',
      ],
    },
    {
      title: 'Lean Beef Stir-Fry',
      ingredients: [
        `${Math.round(p / 0.26 * 0.8)}g lean beef strips (sirloin)`,
        `${Math.round(c * 0.5 / 0.23)}g cooked jasmine rice`,
        '1 cup mixed stir-fry vegetables (zucchini, mushrooms, snap peas)',
        `${Math.round(f * 0.4 / 4.5)} tsp sesame oil`,
        '1 tbsp low-sodium soy sauce',
        '1 tsp fresh ginger, minced',
        '1 clove garlic, minced',
      ],
      instructions: [
        'Cook rice according to package directions.',
        'Heat sesame oil in a wok or large skillet over high heat.',
        'Stir-fry beef strips 2-3 minutes until browned. Remove and set aside.',
        'Add vegetables, garlic, and ginger. Stir-fry 3-4 minutes.',
        'Return beef, add soy sauce, toss to combine. Serve over rice.',
      ],
    },
    {
      title: 'Turkey Meatballs with Pasta & Vegetables',
      ingredients: [
        `${Math.round(p / 0.27 * 0.85)}g ground turkey (93% lean)`,
        `${Math.round(c * 0.5 / 0.25)}g whole wheat pasta (dry)`,
        '1/2 cup marinara sauce (low sugar)',
        '1 cup steamed zucchini and spinach',
        `${Math.round(f * 0.3 / 4.5)} tsp olive oil`,
        '1 clove garlic, minced',
        'Italian seasoning, salt, pepper',
      ],
      instructions: [
        'Mix ground turkey with garlic, Italian seasoning, salt, and pepper. Form into small meatballs.',
        'Bake meatballs at 400F for 15-18 minutes until cooked through.',
        'Cook pasta according to package directions. Drain.',
        'Warm marinara sauce, toss with pasta. Top with meatballs and steamed vegetables.',
      ],
    },
  ];
}

function getSnackOptions(p, c, f) {
  return [
    {
      title: 'Protein Shake & Rice Cakes',
      ingredients: [
        '1 scoop whey protein (25g protein)',
        '8 oz water or unsweetened almond milk',
        `${Math.max(1, Math.round(c / 8))} plain rice cakes`,
        `${Math.round(f / 8 * 7)}g almond butter`,
        '1/2 banana (optional)',
      ],
      instructions: [
        'Blend protein powder with water or almond milk until smooth.',
        'Spread almond butter on rice cakes.',
        'Top with banana slices if desired. Enjoy with the shake.',
      ],
    },
    {
      title: 'Cottage Cheese & Fruit Bowl',
      ingredients: [
        `${Math.round(p / 0.11 * 0.8)}g low-fat cottage cheese`,
        '1/2 cup pineapple or peach chunks',
        `${Math.round(f / 5.5 * 10)}g mixed nuts`,
        'Sprinkle of chia seeds (1 tsp)',
      ],
      instructions: [
        'Scoop cottage cheese into a bowl.',
        'Top with fruit chunks, mixed nuts, and chia seeds.',
        'Mix gently and serve chilled.',
      ],
    },
    {
      title: 'Apple Slices with Peanut Butter',
      ingredients: [
        '1 medium apple, sliced',
        `${Math.round(f * 0.6 / 5)}g natural peanut butter`,
        `${Math.round(p * 0.5 / 0.8)}g beef jerky or protein bar`,
        'Sprinkle of cinnamon',
      ],
      instructions: [
        'Slice apple and arrange on a plate.',
        'Serve peanut butter on the side for dipping.',
        'Pair with beef jerky or a protein bar to hit your protein target.',
      ],
    },
  ];
}

function getBrunchOptions(p, c, f) {
  return [
    {
      title: 'Loaded Egg & Veggie Scramble with Toast',
      ingredients: [
        `${Math.round(p * 0.4 / 3.6)} egg whites + 2 whole eggs`,
        `${Math.round(c * 0.4 / 0.13 / 28)} slices whole grain toast`,
        '1/2 avocado, sliced',
        '1/2 cup spinach',
        '1/4 cup diced tomatoes',
        '1/4 cup mushrooms, sliced',
        `${Math.round(f * 0.15 / 4.5)} tsp olive oil`,
      ],
      instructions: [
        'Heat olive oil in a nonstick pan over medium heat.',
        'Saute spinach, mushrooms, and tomatoes for 2-3 minutes.',
        'Add egg whites and whole eggs. Scramble until fully cooked.',
        'Toast bread. Serve scramble alongside toast with avocado slices.',
      ],
    },
    {
      title: 'Protein Pancakes with Fruit',
      ingredients: [
        `${Math.round(c * 0.5 / 0.6)}g rolled oats`,
        '1 scoop protein powder',
        '2 egg whites + 1 whole egg',
        '1/2 banana, mashed',
        '1/2 cup blueberries',
        `${Math.round(f * 0.3 / 5)}g natural peanut butter`,
        'Cooking spray',
      ],
      instructions: [
        'Blend oats, protein powder, eggs, and banana into a batter.',
        'Heat a nonstick pan with cooking spray over medium heat.',
        'Pour small pancakes (about 1/4 cup each). Cook 2 min per side.',
        'Stack pancakes, top with blueberries and peanut butter.',
      ],
    },
    {
      title: 'Smoked Salmon Bagel Bowl',
      ingredients: [
        `${Math.round(p * 0.5 / 0.2)}g smoked salmon`,
        `${Math.round(c * 0.4 / 0.5)}g whole wheat bagel`,
        `${Math.round(f * 0.3 / 2.5)}g cream cheese (light)`,
        '1/4 red onion, thinly sliced',
        'Capers, dill',
        '1/2 cup mixed greens',
      ],
      instructions: [
        'Toast or slice bagel and spread with cream cheese.',
        'Layer smoked salmon, red onion, and capers on top.',
        'Serve with mixed greens on the side. Garnish with fresh dill.',
      ],
    },
  ];
}

function getLargeDinnerOptions(p, c, f) {
  return [
    {
      title: 'Herb Chicken with Roasted Vegetables & Rice',
      ingredients: [
        `${Math.round(p / 0.31)}g chicken breast`,
        `${Math.round(c * 0.5 / 0.28)}g cooked brown rice`,
        '1.5 cups roasted vegetables (zucchini, bell pepper, onion)',
        `${Math.round(f * 0.4 / 4.5)} tsp olive oil`,
        'Italian seasoning, salt, pepper',
        'Side salad with 1 cup mixed greens and lemon dressing',
      ],
      instructions: [
        'Preheat oven to 425F (220C).',
        'Season chicken with Italian seasoning, salt, and pepper.',
        'Toss vegetables with olive oil and spread on a baking sheet.',
        'Bake chicken and vegetables for 20-25 minutes.',
        'Serve over brown rice with a small side salad.',
      ],
    },
    {
      title: 'Salmon Bowl with Quinoa & Greens',
      ingredients: [
        `${Math.round(p / 0.25)}g salmon fillet`,
        `${Math.round(c * 0.5 / 0.21)}g cooked quinoa`,
        '1 cup steamed broccoli',
        '1/2 avocado, sliced',
        '1/4 cup edamame',
        '1 tsp sesame seeds',
        '1 tbsp low-sodium soy sauce',
      ],
      instructions: [
        'Cook quinoa according to package directions.',
        'Season salmon with salt and pepper. Pan-sear 4-5 min per side.',
        'Steam broccoli until tender-crisp.',
        'Assemble bowl: quinoa base, salmon on top, surround with broccoli, avocado, and edamame.',
        'Drizzle soy sauce and sprinkle sesame seeds.',
      ],
    },
    {
      title: 'Lean Beef Burger with Sweet Potato Fries',
      ingredients: [
        `${Math.round(p / 0.26)}g lean ground beef (90% lean)`,
        `${Math.round(c * 0.5 / 0.2)}g sweet potato, cut into fries`,
        '1 whole wheat burger bun',
        'Lettuce, tomato, onion slices',
        `${Math.round(f * 0.3 / 4.5)} tsp olive oil`,
        'Mustard or ketchup (1 tbsp)',
      ],
      instructions: [
        'Season ground beef with salt and pepper, form into a patty.',
        'Grill or pan-sear patty 4-5 minutes per side.',
        'Cut sweet potato into fries, toss with olive oil, bake at 425F for 20 minutes.',
        'Assemble burger with lettuce, tomato, and onion. Serve with sweet potato fries.',
      ],
    },
  ];
}

// --- Food List with Quantities ---

function getFoodList(data) {
  const pServing = Math.round(data.proteinGrams / data.mealsPerDay);
  const cServing = Math.round(data.carbsGrams / data.mealsPerDay);
  const fServing = Math.round(data.fatGrams / data.mealsPerDay);

  return {
    proteins: [
      { name: 'Chicken breast', grams: Math.round(pServing / 0.31) },
      { name: 'Ground turkey (93% lean)', grams: Math.round(pServing / 0.29) },
      { name: 'Salmon fillet', grams: Math.round(pServing / 0.25) },
      { name: 'Tilapia', grams: Math.round(pServing / 0.26) },
      { name: 'Lean beef (sirloin)', grams: Math.round(pServing / 0.26) },
      { name: 'Egg whites', grams: Math.round(pServing / 0.11) },
      { name: 'Nonfat Greek yogurt', grams: Math.round(pServing / 0.10) },
      { name: 'Low-fat cottage cheese', grams: Math.round(pServing / 0.11) },
    ],
    carbs: [
      { name: 'Brown rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Quinoa (cooked)', grams: Math.round(cServing / 0.21) },
      { name: 'Sweet potato (baked)', grams: Math.round(cServing / 0.20) },
      { name: 'Rolled oats (dry)', grams: Math.round(cServing / 0.60) },
      { name: 'Whole grain bread', grams: Math.round(cServing / 0.43) },
      { name: 'Jasmine rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Whole wheat pasta (cooked)', grams: Math.round(cServing / 0.25) },
    ],
    fats: [
      { name: 'Avocado', grams: Math.round(fServing / 0.15) },
      { name: 'Olive oil', grams: Math.round(fServing / 0.92) },
      { name: 'Almonds', grams: Math.round(fServing / 0.50) },
      { name: 'Walnuts', grams: Math.round(fServing / 0.65) },
      { name: 'Natural peanut butter', grams: Math.round(fServing / 0.50) },
      { name: 'Chia seeds', grams: Math.round(fServing / 0.31) },
    ],
  };
}

// --- Weekly Grocery Shopping List ---

function getWeeklyGroceryList(data) {
  const w = 7;
  const pDaily = data.proteinGrams;
  const cDaily = data.carbsGrams;
  const fDaily = data.fatGrams;

  return {
    'Proteins': [
      `Chicken breast — ${Math.round(pDaily * 0.30 / 0.31 * w)}g`,
      `Ground turkey (93% lean) — ${Math.round(pDaily * 0.15 / 0.29 * w)}g`,
      `Salmon fillets — ${Math.round(pDaily * 0.15 / 0.25 * w)}g`,
      `Eggs — ${Math.max(12, Math.round(pDaily * 0.10 / 6 * w))} units`,
      `Nonfat Greek yogurt — ${Math.round(pDaily * 0.10 / 0.10 * w)}g`,
      `Low-fat cottage cheese — ${Math.round(pDaily * 0.05 / 0.11 * w)}g`,
      'Whey protein powder — 1 container',
    ],
    'Carbs & Grains': [
      `Brown rice (dry) — ${Math.round(cDaily * 0.25 / 0.77 * w)}g`,
      `Rolled oats — ${Math.round(cDaily * 0.15 / 0.60 * w)}g`,
      `Sweet potatoes — ${Math.round(cDaily * 0.20 / 0.20 * w)}g`,
      `Quinoa (dry) — ${Math.round(cDaily * 0.10 / 0.64 * w)}g`,
      `Whole grain bread — ${Math.round(cDaily * 0.10 / 0.43 * w)}g`,
      'Rice cakes — 1 package',
    ],
    'Healthy Fats': [
      `Avocados — ${Math.max(3, Math.round(fDaily * 0.20 / 15 * w))} units`,
      `Extra virgin olive oil — ${Math.round(fDaily * 0.20 / 0.92 * w)}ml`,
      `Almonds — ${Math.round(fDaily * 0.15 / 0.50 * w)}g`,
      `Natural peanut butter — ${Math.round(fDaily * 0.15 / 0.50 * w)}g`,
      `Walnuts — ${Math.round(fDaily * 0.10 / 0.65 * w)}g`,
      'Chia seeds — 1 bag',
    ],
    'Fruits': [
      'Bananas — 7 units',
      'Blueberries — 500g',
      'Strawberries — 500g',
      'Apples — 5 units',
      'Lemons — 4 units',
    ],
    'Vegetables': [
      'Broccoli — 1kg',
      'Spinach — 500g',
      'Asparagus — 500g',
      'Bell peppers (mixed) — 6 units',
      'Zucchini — 4 units',
      'Mushrooms — 300g',
      'Tomatoes — 500g',
      'Onions — 4 units',
      'Garlic — 2 heads',
    ],
    'Pantry & Seasonings': [
      'Low-sodium soy sauce',
      'Italian seasoning',
      'Cinnamon',
      'Garlic powder',
      'Cooking spray',
      'Salt & pepper',
      'Honey',
    ],
  };
}

// --- Meal Timing ---

function getMealTiming(mealsPerDay, client) {
  const wakeUp = getClientField(client, 'wake up', 'q5', 'bed');
  const training = getClientField(client, 'time of day', 'q17', 'train');
  const firstMeal = getClientField(client, 'first meal', 'q7');

  const timings = [];

  if (mealsPerDay === 2) {
    timings.push({ meal: 'Meal 1 (Brunch)', time: '10:00 - 11:00 AM', note: 'Larger meal to fuel your day' });
    timings.push({ meal: 'Meal 2 (Dinner)', time: '5:00 - 7:00 PM', note: 'Biggest meal of the day for recovery' });
  } else if (mealsPerDay === 3) {
    timings.push({ meal: 'Breakfast', time: '7:00 - 8:00 AM', note: 'Within 1 hour of waking up' });
    timings.push({ meal: 'Lunch', time: '12:00 - 1:00 PM', note: 'Midday fuel for energy' });
    timings.push({ meal: 'Dinner', time: '6:00 - 7:30 PM', note: 'At least 2-3 hours before bed' });
  } else if (mealsPerDay === 4) {
    timings.push({ meal: 'Breakfast', time: '7:00 - 8:00 AM', note: 'Start your metabolism' });
    timings.push({ meal: 'Lunch', time: '12:00 - 1:00 PM', note: 'Midday fuel' });
    timings.push({ meal: 'Snack', time: '3:00 - 4:00 PM', note: 'Prevent evening overeating' });
    timings.push({ meal: 'Dinner', time: '6:30 - 8:00 PM', note: 'Last meal of the day' });
  } else {
    timings.push({ meal: 'Breakfast', time: '7:00 AM', note: 'Within 1 hour of waking' });
    timings.push({ meal: 'Snack 1', time: '10:00 AM', note: 'Light fuel' });
    timings.push({ meal: 'Lunch', time: '12:30 PM', note: 'Main midday meal' });
    timings.push({ meal: 'Snack 2', time: '3:30 PM', note: 'Pre/post workout fuel' });
    timings.push({ meal: 'Dinner', time: '6:30 PM', note: 'Recovery meal' });
    if (mealsPerDay >= 6) {
      timings.push({ meal: 'Evening Snack', time: '8:30 PM', note: 'Casein protein or light snack' });
    }
  }

  let routineNote = '';
  if (wakeUp) routineNote += `Sleep schedule: ${wakeUp}. `;
  if (training) routineNote += `Training time: ${training}. `;
  if (firstMeal) routineNote += `Usual first meal: ${firstMeal}. `;
  if (routineNote) routineNote = `Based on your routine: ${routineNote}Adjust meal times to fit your schedule.`;

  return { timings, routineNote };
}

// --- Workout Nutrition ---

function getWorkoutNutrition(goal, client) {
  const training = getClientField(client, 'type of training', 'q16', 'training');
  const trainingTime = getClientField(client, 'time of day', 'q17', 'train');

  const pre = {
    timing: '30-60 minutes before training',
    foods: [],
    notes: '',
  };
  const post = {
    timing: 'Within 30-45 minutes after training',
    foods: [],
    notes: '',
  };

  if (goal === 'fat-loss') {
    pre.foods = ['1 rice cake with 1 tbsp peanut butter', 'OR 1/2 banana with a small handful of almonds', 'OR 1 scoop protein with water (if short on time)'];
    pre.notes = 'Keep it light. The goal is energy without excess calories.';
    post.foods = ['1 scoop whey protein shake with water', '1 medium banana or 1/2 cup rice', 'OR a balanced meal if training close to mealtime'];
    post.notes = 'Prioritize protein post-workout to preserve lean muscle.';
  } else if (goal === 'muscle-gain') {
    pre.foods = ['1 cup oatmeal with banana and 1 tbsp honey', 'OR 2 rice cakes with peanut butter and banana', 'OR toast with eggs (if 1+ hour before training)'];
    pre.notes = 'You need carbs and energy to train hard. Do not skip this.';
    post.foods = ['1.5 scoops whey protein with 1 banana blended', 'OR chicken + rice bowl within 1 hour of training', 'Add 5g creatine if supplementing'];
    post.notes = 'This is your biggest window for growth. Hit protein + carbs.';
  } else {
    pre.foods = ['1 banana or apple with a small handful of almonds', 'OR 1 rice cake with peanut butter', 'OR a small portion of oats'];
    pre.notes = 'Eat enough to fuel your session but not too heavy.';
    post.foods = ['1 scoop protein shake with fruit', 'OR your next scheduled meal if within 1 hour'];
    post.notes = 'Focus on a balanced meal with protein and carbs.';
  }

  let trainingInfo = '';
  if (training) trainingInfo += `Training: ${training}. `;
  if (trainingTime) trainingInfo += `Usual time: ${trainingTime}.`;

  return { pre, post, trainingInfo };
}

// --- Foods to Avoid ---

function getFoodsToAvoid(goal, client) {
  const allergies = getClientField(client, 'allerg', 'q11', 'intolerance');
  const dislikes = getClientField(client, 'dislike', 'q12', 'refuse');

  const avoid = [];

  if (goal === 'fat-loss') {
    avoid.push(
      { item: 'Sugary drinks', reason: 'Soda, juice, energy drinks - high in empty calories' },
      { item: 'Fried foods', reason: 'French fries, fried chicken - high calorie, low nutrition' },
      { item: 'Processed snacks', reason: 'Chips, cookies, candy bars - trigger overeating' },
      { item: 'Alcohol', reason: 'Slows fat metabolism and adds empty calories' },
      { item: 'White bread & pastries', reason: 'Spike blood sugar, low satiety' },
      { item: 'Creamy sauces & dressings', reason: 'Hidden calories and fats' },
    );
  } else if (goal === 'muscle-gain') {
    avoid.push(
      { item: 'Excessive alcohol', reason: 'Impairs muscle protein synthesis and recovery' },
      { item: 'Highly processed fast food', reason: 'Poor nutrient density despite high calories' },
      { item: 'Sugar-heavy cereals', reason: 'Replace with oats or whole grain options' },
      { item: 'Low-calorie diet foods', reason: 'You need calories to grow - avoid "diet" products' },
    );
  } else {
    avoid.push(
      { item: 'Ultra-processed foods', reason: 'Replace with whole food alternatives' },
      { item: 'Excessive sugar', reason: 'Limit added sugars to under 25g/day' },
      { item: 'Trans fats', reason: 'Found in margarine, fried foods, packaged snacks' },
    );
  }

  return { avoid, allergies, dislikes };
}

// --- Progress Note ---

function getProgressNote(goal, weight) {
  if (goal === 'fat-loss') {
    return `Following this plan consistently, you can expect to lose approximately 1-1.5 lbs per week. In 4 weeks, that's 4-6 lbs of fat loss while preserving muscle mass. Results depend on consistency, training intensity, sleep, and stress management. We will reassess and adjust your plan every 2-4 weeks based on your progress.`;
  } else if (goal === 'muscle-gain') {
    return `With consistent training and nutrition, you can expect to gain approximately 0.5-1 lb of lean muscle per week. In 8 weeks, that's 4-8 lbs of quality muscle gain. Track your lifts and body measurements to monitor progress. We will reassess your calorie needs every 3-4 weeks as your weight increases.`;
  }
  return `Following this maintenance plan, your weight should remain stable within 1-2 lbs. Focus on body composition changes rather than the scale. If you notice unintended weight gain or loss, we will adjust your portions and macros accordingly. Check-ins every 2-4 weeks recommended.`;
}

// --- Tips ---

function generateTips(goal, client) {
  const tips = [
    'Eat slowly and mindfully to improve digestion and satiety.',
    'Prep meals in advance to stay consistent with your plan.',
    'Track your food for the first 2 weeks to build awareness of portions.',
  ];

  if (goal === 'fat-loss') {
    tips.push('Prioritize protein at every meal to preserve muscle mass.');
    tips.push('Limit liquid calories (sodas, juices, alcohol).');
    tips.push('Include fiber-rich vegetables to stay full longer.');
    tips.push('Avoid eating 2-3 hours before bedtime.');
    tips.push('Use a food scale for accuracy, especially in the first few weeks.');
  } else if (goal === 'muscle-gain') {
    tips.push('Eat within 1-2 hours after training for optimal recovery.');
    tips.push('Spread protein intake evenly across all meals.');
    tips.push('Include calorie-dense foods like nuts, avocado, and olive oil.');
    tips.push('Prioritize sleep (7-9 hours) for muscle recovery.');
    tips.push('Do not skip meals - consistency is key for growth.');
  } else {
    tips.push('Focus on whole, minimally processed foods.');
    tips.push('Monitor your energy levels and adjust portions accordingly.');
    tips.push('Keep a balanced ratio of protein, carbs, and fats.');
    tips.push('Stay consistent with meal timing.');
  }

  return tips;
}

// --- Build Plan HTML ---

function buildPlanHTML(data) {
  let personalNoteHTML = '';
  if (data.personalNote && data.personalNote.trim()) {
    personalNoteHTML = `
      <div class="plan-section">
        <h3>Personal Note from Your Trainer</h3>
        <div class="personal-note-box">${data.personalNote.replace(/\n/g, '<br>')}</div>
      </div>
    `;
  }

  let mealsHTML = data.mealPlan.map(meal => `
    <div class="meal-card">
      <h4>${meal.name}</h4>
      <div class="meal-macros">
        ${meal.calories} cal | P: ${meal.protein}g | C: ${meal.carbs}g | F: ${meal.fats}g
      </div>
      <div class="meal-option">
        <h5>Option A: ${meal.optionA.title}</h5>
        <div class="recipe-section">
          <strong>Ingredients:</strong>
          <ul>${meal.optionA.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
          <strong>Instructions:</strong>
          <ol>${meal.optionA.instructions.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
      </div>
      <div class="meal-option">
        <h5>Option B: ${meal.optionB.title}</h5>
        <div class="recipe-section">
          <strong>Ingredients:</strong>
          <ul>${meal.optionB.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
          <strong>Instructions:</strong>
          <ol>${meal.optionB.instructions.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
      </div>
      <div class="meal-option">
        <h5>Option C: ${meal.optionC.title}</h5>
        <div class="recipe-section">
          <strong>Ingredients:</strong>
          <ul>${meal.optionC.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
          <strong>Instructions:</strong>
          <ol>${meal.optionC.instructions.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
      </div>
    </div>
  `).join('');

  let foodListHTML = '';
  if (data.foodList) {
    const fl = data.foodList;
    const foodCategories = {
      'Proteins': fl.proteins,
      'Carbs': fl.carbs,
      'Fats': fl.fats,
    };
    foodListHTML = `
      <div class="plan-section">
        <h3>Food List</h3>
        <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px;">Quantities shown per serving (1 meal) to meet your macro targets.</p>
        <div class="food-categories">
          ${Object.entries(foodCategories).map(([cat, foods]) => `
            <div class="food-category">
              <h5>${cat}</h5>
              <ul>${foods.map(f => `<li>${f.name} — ${f.grams}g</li>`).join('')}</ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let groceryHTML = '';
  if (data.groceryList) {
    groceryHTML = `
      <div class="plan-section">
        <h3>Weekly Grocery Shopping List</h3>
        <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px;">Estimated quantities for 1 week (7 days).</p>
        <div class="grocery-grid">
          ${Object.entries(data.groceryList).map(([cat, items]) => `
            <div class="grocery-category">
              <h5>${cat}</h5>
              <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let timingHTML = '';
  if (data.mealTiming) {
    const mt = data.mealTiming;
    timingHTML = `
      <div class="plan-section">
        <h3>Meal Timing</h3>
        ${mt.routineNote ? `<p class="routine-note">${mt.routineNote}</p>` : ''}
        <div class="timing-list">
          ${mt.timings.map(t => `
            <div class="timing-item">
              <span class="timing-meal">${t.meal}</span>
              <span class="timing-time">${t.time}</span>
              <span class="timing-note">${t.note}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let workoutHTML = '';
  if (data.workoutNutrition) {
    const wn = data.workoutNutrition;
    workoutHTML = `
      <div class="plan-section">
        <h3>Pre & Post Workout Nutrition</h3>
        ${wn.trainingInfo ? `<p class="routine-note">${wn.trainingInfo}</p>` : ''}
        <div class="workout-nutrition">
          <div class="workout-block pre">
            <h5>Pre-Workout (${wn.pre.timing})</h5>
            <ul>${wn.pre.foods.map(f => `<li>${f}</li>`).join('')}</ul>
            <p class="workout-note">${wn.pre.notes}</p>
          </div>
          <div class="workout-block post">
            <h5>Post-Workout (${wn.post.timing})</h5>
            <ul>${wn.post.foods.map(f => `<li>${f}</li>`).join('')}</ul>
            <p class="workout-note">${wn.post.notes}</p>
          </div>
        </div>
      </div>
    `;
  }

  let avoidHTML = '';
  if (data.foodsToAvoid) {
    const fa = data.foodsToAvoid;
    let restrictionsNote = '';
    if (fa.allergies) restrictionsNote += `<p class="restriction-note"><strong>Allergies/Intolerances:</strong> ${fa.allergies}</p>`;
    if (fa.dislikes) restrictionsNote += `<p class="restriction-note"><strong>Food Dislikes:</strong> ${fa.dislikes}</p>`;

    avoidHTML = `
      <div class="plan-section">
        <h3>Foods to Avoid</h3>
        ${restrictionsNote}
        <div class="avoid-list">
          ${fa.avoid.map(a => `
            <div class="avoid-item">
              <span class="avoid-food">${a.item}</span>
              <span class="avoid-reason">${a.reason}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let progressHTML = '';
  if (data.progressNote) {
    progressHTML = `
      <div class="plan-section">
        <h3>Expected Progress</h3>
        <div class="progress-note-box">${data.progressNote}</div>
      </div>
    `;
  }

  return `
    <div class="plan-header">
      <h2>Nutrition Guidance</h2>
      <div class="client-name">${data.clientName}</div>
      <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 4px;">
        Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>

    ${personalNoteHTML}

    <div class="plan-section">
      <h3>Daily Totals</h3>
      <div class="daily-totals">
        <div class="total-row"><span>Calories</span><span>${data.calorieTarget} kcal</span></div>
        <div class="total-row"><span>Protein</span><span>${data.proteinGrams}g / ${data.proteinCals} kcal</span></div>
        <div class="total-row"><span>Carbohydrates</span><span>${data.carbsGrams}g / ${data.carbsCals} kcal</span></div>
        <div class="total-row"><span>Fats</span><span>${data.fatGrams}g / ${data.fatCals} kcal</span></div>
      </div>
    </div>

    <div class="plan-section">
      <h3>Daily Water Intake</h3>
      <div class="water-recommendation">
        <div class="water-amount">${data.waterLiters} liters per day</div>
        <p>Increase by 500ml on training days. Carry a water bottle and sip throughout the day.</p>
      </div>
    </div>

    ${timingHTML}

    <div class="plan-section">
      <h3>Meal Plan (${data.mealsPerDay} meals/day)</h3>
      ${mealsHTML}
    </div>

    ${foodListHTML}

    ${workoutHTML}
    ${groceryHTML}
    ${avoidHTML}
    ${progressHTML}

    <div class="plan-section">
      <h3>Nutrition Tips</h3>
      <ul class="tips-list">
        ${data.tips.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>
  `;
}

// --- PDF Export ---

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const data = computeNutrition();
  const mealPlan = generateMealPlan(data.mealsPerDay, data.proteinGrams, data.carbsGrams, data.fatGrams, data.calorieTarget, data.goal);
  const tips = generateTips(data.goal, selectedClient);
  const foodList = getFoodList(data);
  const groceryList = getWeeklyGroceryList(data);
  const mealTiming = getMealTiming(data.mealsPerDay, selectedClient);
  const workoutNutrition = getWorkoutNutrition(data.goal, selectedClient);
  const foodsToAvoid = getFoodsToAvoid(data.goal, selectedClient);
  const progressNote = getProgressNote(data.goal, data.weight);

  function checkPage(needed) {
    if (y + needed > 275) { doc.addPage(); y = 20; }
  }

  function sectionTitle(text) {
    checkPage(15);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 33, 62);
    doc.text(text, margin, y);
    y += 2;
    doc.setDrawColor(233, 69, 96);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + doc.getTextWidth(text), y);
    y += 6;
  }

  function bodyText(text, indent) {
    const x = margin + (indent || 0);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(text, contentWidth - (indent || 0));
    lines.forEach(line => {
      checkPage(5);
      doc.text(line, x, y);
      y += 4.5;
    });
  }

  function boldText(text, indent) {
    const x = margin + (indent || 0);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(text, x, y);
    y += 5;
  }

  // --- Header ---
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 33, 62);
  doc.text('Nutrition Guidance', pageWidth / 2, y, { align: 'center' });
  y += 10;
  doc.setFontSize(14);
  doc.setTextColor(233, 69, 96);
  doc.text(data.clientName, pageWidth / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // --- Personal Note ---
  if (data.personalNote && data.personalNote.trim()) {
    sectionTitle('Personal Note from Your Trainer');
    bodyText(data.personalNote);
    y += 4;
  }

  // --- Daily Totals ---
  checkPage(30);
  doc.setFillColor(22, 33, 62);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Daily Totals', margin + 6, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Calories: ${data.calorieTarget} kcal`, margin + 6, y + 14);
  doc.text(`Protein: ${data.proteinGrams}g / ${data.proteinCals} kcal  |  Carbs: ${data.carbsGrams}g / ${data.carbsCals} kcal  |  Fats: ${data.fatGrams}g / ${data.fatCals} kcal`, margin + 6, y + 21);
  y += 40;

  // --- Water ---
  sectionTitle('Daily Water Intake');
  bodyText(`Recommended: ${data.waterLiters} liters per day`);
  bodyText('Increase by 500ml on training days. Carry a water bottle and sip throughout the day.');
  y += 4;

  // --- Meal Timing ---
  sectionTitle('Meal Timing');
  if (mealTiming.routineNote) { bodyText(mealTiming.routineNote); y += 2; }
  mealTiming.timings.forEach(t => {
    checkPage(8);
    boldText(`${t.meal}: ${t.time}`);
    bodyText(t.note, 4);
  });
  y += 4;

  // --- Meal Plan ---
  sectionTitle(`Meal Plan (${data.mealsPerDay} meals/day)`);
  mealPlan.forEach(meal => {
    checkPage(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(233, 69, 96);
    doc.text(meal.name, margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${meal.calories} cal | Protein: ${meal.protein}g | Carbs: ${meal.carbs}g | Fats: ${meal.fats}g`, margin + 2, y);
    y += 6;

    [meal.optionA, meal.optionB, meal.optionC].forEach((opt, idx) => {
      const label = ['A', 'B', 'C'][idx];
      checkPage(15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 33, 62);
      doc.text(`Option ${label}: ${opt.title}`, margin + 2, y);
      y += 5;

      boldText('Ingredients:', 4);
      opt.ingredients.forEach(ing => {
        checkPage(5);
        bodyText(`• ${ing}`, 6);
      });
      boldText('Instructions:', 4);
      opt.instructions.forEach((step, si) => {
        checkPage(5);
        bodyText(`${si + 1}. ${step}`, 6);
      });
      y += 3;
    });
    y += 3;
  });

  // --- Food List ---
  sectionTitle('Food List');
  bodyText('Quantities shown per serving (1 meal) to meet your macro targets.');
  y += 2;
  const foodCategories = { 'Proteins': foodList.proteins, 'Carbs': foodList.carbs, 'Fats': foodList.fats };
  Object.entries(foodCategories).forEach(([cat, foods]) => {
    checkPage(10);
    boldText(`${cat}:`);
    foods.forEach(f => {
      checkPage(5);
      bodyText(`• ${f.name} — ${f.grams}g`, 4);
    });
    y += 2;
  });
  y += 4;

  // --- Workout Nutrition ---
  sectionTitle('Pre & Post Workout Nutrition');
  if (workoutNutrition.trainingInfo) bodyText(workoutNutrition.trainingInfo);
  boldText(`Pre-Workout (${workoutNutrition.pre.timing})`);
  workoutNutrition.pre.foods.forEach(f => bodyText(`• ${f}`, 4));
  bodyText(workoutNutrition.pre.notes, 4);
  y += 2;
  boldText(`Post-Workout (${workoutNutrition.post.timing})`);
  workoutNutrition.post.foods.forEach(f => bodyText(`• ${f}`, 4));
  bodyText(workoutNutrition.post.notes, 4);
  y += 4;

  // --- Grocery List ---
  sectionTitle('Weekly Grocery Shopping List');
  Object.entries(groceryList).forEach(([cat, items]) => {
    checkPage(10);
    boldText(`${cat}:`);
    items.forEach(item => {
      checkPage(5);
      bodyText(`☐ ${item}`, 4);
    });
    y += 2;
  });
  y += 4;

  // --- Foods to Avoid ---
  sectionTitle('Foods to Avoid');
  if (foodsToAvoid.allergies) bodyText(`Allergies/Intolerances: ${foodsToAvoid.allergies}`);
  if (foodsToAvoid.dislikes) bodyText(`Food Dislikes: ${foodsToAvoid.dislikes}`);
  if (foodsToAvoid.allergies || foodsToAvoid.dislikes) y += 2;
  foodsToAvoid.avoid.forEach(a => {
    checkPage(8);
    boldText(`✗ ${a.item}`);
    bodyText(a.reason, 4);
  });
  y += 4;

  // --- Progress ---
  sectionTitle('Expected Progress');
  bodyText(progressNote);
  y += 4;

  // --- Tips ---
  sectionTitle('Nutrition Tips');
  tips.forEach(tip => {
    checkPage(7);
    bodyText(`✓  ${tip}`);
  });

  const fileName = `${data.clientName.replace(/[^a-zA-Z0-9]/g, '_')}_Nutrition_Guidance.pdf`;
  doc.save(fileName);
}
