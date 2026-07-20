let allClients = [];
let selectedClient = null;
let clientHeaders = [];
let clientProfile = null;
let currentPlanData = null;
let swapHistory = {};

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
  document.getElementById('btn-export').addEventListener('click', approveAndExport);
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

// --- Client Profile Extraction (Q11-Q14) ---

function getClientProfile(client) {
  if (!client) return buildDefaultProfile();
  const allergies     = getClientField(client, 'q11', 'allerg', 'intoleran');
  const dislikes      = getClientField(client, 'q12', 'dislike', 'refuse');
  const favoriteFoods = getClientField(client, 'q13', 'favorite', 'favourit', 'already eat');
  const dietaryStyle  = getClientField(client, 'q14', 'dietary style', 'diet style', 'dietary preference', 'eating style', 'food preference', 'diet type', 'vegan', 'vegetarian', 'carnivore');
  const firstMealTime = getClientField(client, 'q7', 'first meal', 'eating window', 'intermittent fasting');
  const trainingType  = getClientField(client, 'q16', 'type of training', 'training type', 'frequency');
  const trainingTime  = getClientField(client, 'q17', 'time of day', 'training time', 'when do you train');
  const pastNutrition = getClientField(client, 'q19', 'past nutrition', 'nutrition experience', 'tried before', 'previous diet');
  const consistencyRaw = getClientField(client, 'q20', 'consistency', 'how consistent', 'rate yourself');
  const medicalConditions = getClientField(client, 'q21', 'medical', 'condition', 'health condition', 'diagnosis');

  const diet = parseDietaryStyle(dietaryStyle);
  const allergenList = parseListField(allergies);
  const dislikeList  = parseListField(dislikes);
  const favoriteList = parseListField(favoriteFoods);
  const consistencyScore = parseConsistencyScore(consistencyRaw);

  return {
    allergies, dislikes, favoriteFoods, dietaryStyle,
    firstMealTime, trainingType, trainingTime,
    pastNutrition, consistencyScore, medicalConditions,
    diet, allergenList, dislikeList, favoriteList,
  };
}

function buildDefaultProfile() {
  return {
    allergies: '', dislikes: '', favoriteFoods: '', dietaryStyle: '',
    firstMealTime: '', trainingType: '', trainingTime: '',
    pastNutrition: '', consistencyScore: 5, medicalConditions: '',
    diet: parseDietaryStyle(''), allergenList: [], dislikeList: [], favoriteList: [],
  };
}

function parseConsistencyScore(text) {
  if (!text) return 5;
  const num = parseInt(text);
  if (!isNaN(num) && num >= 1 && num <= 10) return num;
  const m = text.match(/\b([1-9]|10)\b/);
  if (m) return parseInt(m[1]);
  const t = text.toLowerCase();
  if (t.includes('always') || t.includes('very high') || t.includes('perfect')) return 9;
  if (t.includes('high') || t.includes('mostly') || t.includes('usually')) return 7;
  if (t.includes('medium') || t.includes('moderate') || t.includes('sometimes')) return 5;
  if (t.includes('low') || t.includes('struggle') || t.includes('inconsist') || t.includes('hard time')) return 3;
  return 5;
}

function parseDietaryStyle(text) {
  const t = (text || '').toLowerCase();
  const isVegan = t.includes('vegan') || t.includes('plant-based') || t.includes('plant based') || t.includes('no animal products') || t.includes('only plants');
  const isVegetarian = !isVegan && (t.includes('vegetarian') || t.includes('veggie') || t.includes('no meat') || t.includes('without meat') || t.includes('meat free') || t.includes('meat-free'));
  const isKeto = t.includes('keto');
  const isLowCarb = !isKeto && (t.includes('low carb') || t.includes('low-carb'));
  const isCarnivore = t.includes('carnivore') || t.includes('only meat') || t.includes('only animal');
  const isPescatarian = !isVegan && !isVegetarian && (t.includes('pescatarian') || t.includes('pescetarian'));
  return { isVegan, isVegetarian, isLowCarb, isKeto, isCarnivore, isPescatarian };
}

function parseListField(text) {
  if (!text || !text.trim()) return [];
  return text.split(/[,;\/\n]|\band\b/i)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 1);
}

const ALLERGEN_EXPANSIONS = {
  'dairy': ['milk', 'yogurt', 'cheese', 'cream', 'butter', 'whey', 'lactose', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'cottage cheese'],
  'lactose': ['milk', 'yogurt', 'cheese', 'cream', 'butter', 'lactose'],
  'gluten': ['wheat', 'bread', 'pasta', 'oats', 'barley', 'rye', 'flour', 'tortilla', 'bagel', 'granola', 'cracker'],
  'nuts': ['almond', 'walnut', 'cashew', 'peanut', 'pistachio', 'pecan', 'hazelnut', 'brazil', 'macadamia'],
  'tree nuts': ['almond', 'walnut', 'cashew', 'pistachio', 'pecan', 'hazelnut', 'brazil', 'macadamia'],
  'peanuts': ['peanut'],
  'shellfish': ['shrimp', 'crab', 'lobster', 'clam', 'oyster', 'scallop', 'mussel'],
  'fish': ['salmon', 'tuna', 'tilapia', 'cod', 'halibut', 'sardine', 'mackerel', 'smoked salmon'],
  'soy': ['soy', 'tofu', 'edamame', 'tempeh', 'miso'],
  'eggs': ['egg'],
};

function expandRestriction(term) {
  return ALLERGEN_EXPANSIONS[term.toLowerCase()] || [term];
}

function optionMatchesRestrictions(option, allergenList, dislikeList) {
  const text = [option.title, ...(option.ingredients || [])].join(' ').toLowerCase();
  const terms = [...allergenList.flatMap(expandRestriction), ...dislikeList.flatMap(expandRestriction)];
  return terms.some(term => term && text.includes(term));
}

function sortByFavorites(options, favoriteList) {
  if (!favoriteList || favoriteList.length === 0) return options;
  return [...options].sort((a, b) => {
    const aText = [a.title, ...(a.ingredients || [])].join(' ').toLowerCase();
    const bText = [b.title, ...(b.ingredients || [])].join(' ').toLowerCase();
    const aMatch = favoriteList.some(fav => aText.includes(fav));
    const bMatch = favoriteList.some(fav => bText.includes(fav));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });
}

function filterMealOptions(options, profile) {
  if (!profile) return options;
  let result = options;
  if (profile.allergenList.length || profile.dislikeList.length) {
    const filtered = options.filter(opt =>
      !optionMatchesRestrictions(opt, profile.allergenList, profile.dislikeList)
    );
    if (filtered.length > 0) result = filtered;
  }
  if (profile.favoriteList.length) result = sortByFavorites(result, profile.favoriteList);
  return result;
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
  displayPreviousPlan();
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

  // Determine activity level from Q4 (lifestyle/occupation) and Q16 (training frequency) — Q16 takes priority
  const q4Field = getClientField(selectedClient, 'q4', 'lifestyle', 'occupation', 'how active', 'daily activity', 'activity level');
  const trainingField = getClientField(selectedClient, 'q16', 'type of training', 'training type', 'frequency');

  let activityFromQ16 = null;
  if (trainingField) {
    const t16 = trainingField.toLowerCase();
    const freqMatch = trainingField.match(/(\d+)\s*(?:x|times?|days?(?:\/| per )?week)/i);
    if (freqMatch) {
      const freq = parseInt(freqMatch[1]);
      if (freq <= 1)      activityFromQ16 = '1.2';
      else if (freq <= 2) activityFromQ16 = '1.375';
      else if (freq <= 5) activityFromQ16 = '1.55';
      else if (freq <= 6) activityFromQ16 = '1.725';
      else                activityFromQ16 = '1.9';
    } else if (t16.includes('sedentary') || t16.includes('no exercise') || t16.includes('not active')) {
      activityFromQ16 = '1.2';
    } else if (t16.includes('lightly') || t16.includes('1-2') || t16.includes('once') || t16.includes('twice a week')) {
      activityFromQ16 = '1.375';
    } else if (t16.includes('moderately') || t16.includes('3-5') || t16.includes('3 to 5')) {
      activityFromQ16 = '1.55';
    } else if (t16.includes('very active') || t16.includes('6-7') || t16.includes('daily')) {
      activityFromQ16 = '1.725';
    } else if (t16.includes('extremely') || t16.includes('athlete') || t16.includes('twice daily') || t16.includes('physical job')) {
      activityFromQ16 = '1.9';
    }
  }

  let activityFromQ4 = null;
  if (q4Field) {
    const t4 = q4Field.toLowerCase();
    if (t4.includes('sedentary') || t4.includes('desk') || t4.includes('office') || t4.includes('not active') || t4.includes('not very')) {
      activityFromQ4 = '1.2';
    } else if (t4.includes('lightly') || t4.includes('light') || t4.includes('walk') || t4.includes('teacher') || t4.includes('nurse') || t4.includes('standing')) {
      activityFromQ4 = '1.375';
    } else if (t4.includes('moderate')) {
      activityFromQ4 = '1.55';
    } else if (t4.includes('very active') || t4.includes('physical') || t4.includes('construction') || t4.includes('labor') || t4.includes('labour')) {
      activityFromQ4 = '1.725';
    } else if (t4.includes('extremely') || t4.includes('athlete') || t4.includes('twice daily')) {
      activityFromQ4 = '1.9';
    }
  }

  const activityValue = activityFromQ16 || activityFromQ4;
  if (activityValue) {
    document.getElementById('activity-level').value = activityValue;
  }

  const keys = Object.keys(selectedClient);
  const goalKey = keys.find(k => k.toLowerCase().includes('goal') || k.toLowerCase().includes('q2'));
  if (goalKey && selectedClient[goalKey]) {
    const goalVal = selectedClient[goalKey].toLowerCase();
    const wantsLoss = goalVal.includes('loss') || goalVal.includes('lose') || goalVal.includes('drop') || goalVal.includes('slim') || goalVal.includes('shred') || goalVal.includes('cut ') || goalVal.includes('cutting');
    const wantsGain = goalVal.includes('gain') || goalVal.includes('muscle') || goalVal.includes('build') || goalVal.includes('bulk') || goalVal.includes('mass');
    if (wantsLoss && wantsGain) {
      document.getElementById('goal').value = 'body-recomposition';
    } else if (goalVal.includes('recomp') || goalVal.includes('body comp') || goalVal.includes('composition') || goalVal.includes('tone') || goalVal.includes('toning')) {
      document.getElementById('goal').value = 'body-recomposition';
    } else if (wantsLoss || goalVal.includes('fat') || goalVal.includes('lean') || goalVal.includes('weight loss')) {
      document.getElementById('goal').value = 'fat-loss';
    } else if (wantsGain || goalVal.includes('weight gain') || goalVal.includes('gain weight')) {
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
  let heightIn = parseFloat(document.getElementById('height').value);
  const bodyFat = parseFloat(document.getElementById('body-fat').value) || null;
  const age = parseInt(document.getElementById('age').value);
  const gender = document.getElementById('gender').value;
  const activityRaw = parseFloat(document.getElementById('activity-level').value);
  const activityLevel = (!isNaN(activityRaw) && activityRaw >= 1.2) ? activityRaw : 1.2;
  const goal = document.getElementById('goal').value;
  const mealsPerDay = parseInt(document.getElementById('meals-per-day').value);
  const personalNote = document.getElementById('personal-note').value;

  // If height looks like feet.inches notation (e.g. 5.2 meaning 5'2"), convert to total inches.
  // Any value under 12 cannot be a valid height in inches for an adult.
  if (heightIn < 12) {
    const feet = Math.floor(heightIn);
    const decPart = Math.round((heightIn - feet) * 100);
    const inchPart = decPart > 11 ? Math.round(decPart / 10) : decPart;
    heightIn = feet * 12 + inchPart;
  }

  const weight = weightLbs / 2.205;
  const goalWeight = goalWeightLbs ? (parseFloat(goalWeightLbs) / 2.205).toFixed(1) : '';
  const height = heightIn * 2.54;

  // Mifflin-St Jeor BMR
  let bmr;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }
  bmr = Math.round(bmr);

  const tdee = Math.round(bmr * activityLevel);

  let calorieTarget, goalLabel;
  if (goal === 'fat-loss') {
    calorieTarget = tdee - 400;
    goalLabel = 'Fat Loss';
  } else if (goal === 'muscle-gain') {
    calorieTarget = tdee + 250;
    goalLabel = 'Muscle Gain';
  } else if (goal === 'body-recomposition') {
    calorieTarget = tdee - 200;
    goalLabel = 'Body Recomposition';
  } else {
    calorieTarget = tdee;
    goalLabel = 'Maintenance';
  }

  const d = (clientProfile && clientProfile.diet) ? clientProfile.diet : {};

  // Macro percentages — dietary style overrides goal-based split
  let proteinPercent, carbsPercent, fatPercent;
  if (d.isCarnivore) {
    proteinPercent = 0.40; carbsPercent = 0.05; fatPercent = 0.55;
  } else if (d.isKeto || d.isLowCarb) {
    proteinPercent = 0.35; carbsPercent = 0.10; fatPercent = 0.55;
  } else if (goal === 'fat-loss') {
    proteinPercent = 0.35; carbsPercent = 0.35; fatPercent = 0.30;
  } else if (goal === 'muscle-gain') {
    proteinPercent = 0.30; carbsPercent = 0.45; fatPercent = 0.25;
  } else {
    // maintenance and body-recomposition
    proteinPercent = 0.30; carbsPercent = 0.40; fatPercent = 0.30;
  }

  let proteinCals = Math.round(calorieTarget * proteinPercent);
  let proteinGrams = Math.round(proteinCals / 4);

  // Enforce minimum 1g protein per pound of bodyweight
  const minProteinGrams = Math.round(weightLbs);
  if (proteinGrams < minProteinGrams) {
    proteinGrams = minProteinGrams;
    proteinCals = proteinGrams * 4;
  }

  let fatCals = Math.round(calorieTarget * fatPercent);
  let fatGrams = Math.round(fatCals / 9);
  let carbsCals = Math.max(0, calorieTarget - proteinCals - fatCals);
  let carbsGrams = Math.max(0, Math.round(carbsCals / 4));

  // Hard carb caps and adjustments for special diets
  if (clientProfile) {
    if (d.isCarnivore) {
      carbsGrams = 0; carbsCals = 0;
      fatGrams = Math.round((calorieTarget - proteinCals) / 9);
      fatCals  = fatGrams * 9;
    } else if (d.isKeto) {
      carbsGrams = Math.min(carbsGrams, 25); carbsCals = carbsGrams * 4;
      fatGrams = Math.round((calorieTarget - proteinCals - carbsCals) / 9);
      fatCals  = fatGrams * 9;
    } else if (d.isLowCarb) {
      carbsGrams = Math.min(carbsGrams, 50); carbsCals = carbsGrams * 4;
      fatGrams = Math.round((calorieTarget - proteinCals - carbsCals) / 9);
      fatCals  = fatGrams * 9;
    }
    // PCOS / insulin resistance: reduce carbs ~20% unless already low-carb
    if (clientProfile.medicalConditions) {
      const mc = clientProfile.medicalConditions.toLowerCase();
      if ((mc.includes('pcos') || mc.includes('insulin resistance')) && !d.isLowCarb && !d.isKeto && !d.isCarnivore) {
        carbsGrams = Math.round(carbsGrams * 0.80); carbsCals = carbsGrams * 4;
        fatCals  = Math.max(0, calorieTarget - proteinCals - carbsCals);
        fatGrams = Math.round(fatCals / 9);
      }
    }
  }

  const waterLiters = (weight * 0.033).toFixed(1);

  return {
    weight, goalWeight, height, age, gender, activityLevel, goal, goalLabel,
    weightLbs, goalWeightLbs, heightIn, bodyFat,
    mealsPerDay, personalNote,
    bmr, tdee, calorieTarget,
    proteinPercent, carbsPercent, fatPercent,
    proteinGrams, proteinCals, carbsGrams, carbsCals, fatGrams, fatCals,
    waterLiters,
    clientName: getClientName(selectedClient),
  };
}

// --- Nutrition History (localStorage) ---

function getClientHistoryKey(client) {
  const email = getClientEmail(client);
  const name = getClientName(client);
  const id = (email || name).replace(/[^a-zA-Z0-9]/g, '_');
  return `pt_plan_${id}`;
}

const ACTIVITY_LABELS = {
  '1.2': 'Sedentary',
  '1.375': 'Lightly Active',
  '1.55': 'Moderately Active',
  '1.725': 'Very Active',
  '1.9': 'Extremely Active',
};

function getDietaryStyleLabel(profile) {
  if (!profile || !profile.diet) return 'Omnivore';
  const d = profile.diet;
  if (d.isCarnivore) return 'Carnivore';
  if (d.isVegan) return 'Vegan';
  if (d.isVegetarian) return 'Vegetarian';
  if (d.isKeto) return 'Keto';
  if (d.isLowCarb) return 'Low Carb';
  if (d.isPescatarian) return 'Pescatarian';
  return 'Omnivore';
}

function saveClientPlan(data) {
  if (!selectedClient) return;
  try {
    const key = getClientHistoryKey(selectedClient);
    const plan = {
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      clientName: data.clientName,
      goalLabel: data.goalLabel,
      goal: data.goal,
      calorieTarget: data.calorieTarget,
      bmr: data.bmr,
      tdee: data.tdee,
      proteinGrams: data.proteinGrams,
      proteinCals: data.proteinCals,
      carbsGrams: data.carbsGrams,
      carbsCals: data.carbsCals,
      fatGrams: data.fatGrams,
      fatCals: data.fatCals,
      waterLiters: data.waterLiters,
      mealsPerDay: data.mealsPerDay,
      weightLbs: data.weightLbs,
      heightIn: data.heightIn,
      age: data.age,
      gender: data.gender,
      activityLevel: String(data.activityLevel),
      dietaryStyle: getDietaryStyleLabel(clientProfile),
    };
    localStorage.setItem(key, JSON.stringify(plan));
  } catch (e) {}
}

function displayPreviousPlan() {
  const container = document.getElementById('previous-plan-section');
  const columns = document.getElementById('data-columns');
  if (!selectedClient || !container || !columns) return;

  let plan = null;
  try {
    const key = getClientHistoryKey(selectedClient);
    const saved = localStorage.getItem(key);
    if (saved) plan = JSON.parse(saved);
  } catch (e) {}

  if (!plan) {
    container.innerHTML = '';
    columns.classList.remove('has-history');
    const fh = document.getElementById('form-col-header');
    if (fh) fh.classList.add('hidden');
    return;
  }

  // Enable side-by-side grid and show new plan header
  columns.classList.add('has-history');
  const fh = document.getElementById('form-col-header');
  if (fh) fh.classList.remove('hidden');

  // Macro bar widths
  const totalCals = plan.proteinCals + plan.carbsCals + plan.fatCals;
  const pPct = totalCals ? Math.round(plan.proteinCals / totalCals * 100) : 33;
  const cPct = totalCals ? Math.round(plan.carbsCals  / totalCals * 100) : 34;
  const fPct = 100 - pPct - cPct;

  const activityLabel = ACTIVITY_LABELS[plan.activityLevel] || plan.activityLevel;
  const genderLabel = plan.gender === 'male' ? 'Male' : 'Female';

  container.innerHTML = `
    <div class="prev-plan-card">
      <div class="prev-plan-header">
        <div class="prev-plan-badge">Previous Plan on File</div>
        <div class="prev-plan-title">${plan.clientName || 'Client'}</div>
        <div class="prev-plan-date">Generated on ${plan.date}</div>
      </div>
      <div class="prev-plan-body">

        <div>
          <div class="prev-plan-section-label">Goal</div>
          <span class="prev-plan-goal-badge">${plan.goalLabel}</span>
        </div>

        <div>
          <div class="prev-plan-section-label">Body Metrics</div>
          <div class="prev-plan-rows">
            ${plan.weightLbs ? `<div class="prev-plan-row"><span class="prev-plan-row-label">Weight</span><span class="prev-plan-row-value">${plan.weightLbs} lbs</span></div>` : ''}
            ${plan.heightIn  ? `<div class="prev-plan-row"><span class="prev-plan-row-label">Height</span><span class="prev-plan-row-value">${plan.heightIn} in</span></div>` : ''}
            ${plan.age       ? `<div class="prev-plan-row"><span class="prev-plan-row-label">Age</span><span class="prev-plan-row-value">${plan.age} · ${genderLabel}</span></div>` : ''}
            ${activityLabel  ? `<div class="prev-plan-row"><span class="prev-plan-row-label">Activity</span><span class="prev-plan-row-value">${activityLabel}</span></div>` : ''}
          </div>
        </div>

        <div>
          <div class="prev-plan-section-label">Calories</div>
          <div class="prev-plan-rows">
            ${plan.bmr  ? `<div class="prev-plan-row"><span class="prev-plan-row-label">BMR</span><span class="prev-plan-row-value">${plan.bmr} kcal</span></div>` : ''}
            ${plan.tdee ? `<div class="prev-plan-row"><span class="prev-plan-row-label">TDEE</span><span class="prev-plan-row-value">${plan.tdee} kcal</span></div>` : ''}
            <div class="prev-plan-row"><span class="prev-plan-row-label">Target</span><span class="prev-plan-row-value highlight">${plan.calorieTarget} kcal</span></div>
          </div>
        </div>

        <div>
          <div class="prev-plan-section-label">Daily Macros</div>
          <div class="prev-plan-macro-bar">
            <div class="seg-p" style="width:${pPct}%"></div>
            <div class="seg-c" style="width:${cPct}%"></div>
            <div class="seg-f" style="width:${fPct}%"></div>
          </div>
          <div class="prev-plan-macro-legend">
            <span><span class="dot" style="background:#0984e3"></span>P ${plan.proteinGrams}g</span>
            <span><span class="dot" style="background:#00b894"></span>C ${plan.carbsGrams}g</span>
            <span><span class="dot" style="background:#fdcb6e"></span>F ${plan.fatGrams}g</span>
          </div>
          <div class="prev-plan-rows" style="margin-top:8px">
            <div class="prev-plan-row"><span class="prev-plan-row-label">Protein</span><span class="prev-plan-row-value">${plan.proteinGrams}g / ${plan.proteinCals} kcal</span></div>
            <div class="prev-plan-row"><span class="prev-plan-row-label">Carbs</span><span class="prev-plan-row-value">${plan.carbsGrams}g / ${plan.carbsCals} kcal</span></div>
            <div class="prev-plan-row"><span class="prev-plan-row-label">Fats</span><span class="prev-plan-row-value">${plan.fatGrams}g / ${plan.fatCals} kcal</span></div>
          </div>
        </div>

        <div>
          <div class="prev-plan-section-label">Other</div>
          <div class="prev-plan-rows">
            <div class="prev-plan-row"><span class="prev-plan-row-label">Meals/day</span><span class="prev-plan-row-value">${plan.mealsPerDay}</span></div>
            <div class="prev-plan-row"><span class="prev-plan-row-label">Water</span><span class="prev-plan-row-value">${plan.waterLiters}L/day</span></div>
            <div class="prev-plan-row"><span class="prev-plan-row-label">Diet Style</span><span class="prev-plan-row-value">${plan.dietaryStyle || 'Omnivore'}</span></div>
          </div>
        </div>

      </div>
      <div class="prev-plan-footer">New plan will be generated on the right → PDF exports the new plan only.</div>
    </div>
  `;
}

function generatePlan() {
  const weight = document.getElementById('weight').value;
  const height = document.getElementById('height').value;
  const age = document.getElementById('age').value;
  if (!weight || !height || !age) {
    alert('Please fill in weight, height, and age.');
    return;
  }

  clientProfile = getClientProfile(selectedClient);
  const data = computeNutrition();
  const mealPlan = generateMealPlan(data.mealsPerDay, data.proteinGrams, data.carbsGrams, data.fatGrams, data.calorieTarget, data.goal, clientProfile);

  currentPlanData = { ...data, mealPlan };
  swapHistory = {};
  saveClientPlan(data);

  document.getElementById('nutrition-plan').innerHTML = buildPreviewHTML(currentPlanData);
  attachPreviewListeners();
  showStep('step-plan');
}

function generateMealPlan(mealsPerDay, totalProtein, totalCarbs, totalFats, totalCals, goal, profile) {
  const meals = [];
  const mealNames = getMealNames(mealsPerDay);
  const distributions = getMealDistributions(mealsPerDay);

  for (let i = 0; i < mealsPerDay; i++) {
    const dist = distributions[i];
    const mealProtein = Math.round(totalProtein * dist);
    const mealCarbs = Math.round(totalCarbs * dist);
    const mealFats = Math.round(totalFats * dist);
    const mealCals = Math.round(totalCals * dist);

    const options = getMealOptions(i, mealsPerDay, mealProtein, mealCarbs, mealFats, goal, profile);

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

function getMealOptions(mealIndex, totalMeals, protein, carbs, fats, goal, profile) {
  const isBreakfast = mealIndex === 0;
  const isDinner = mealIndex === totalMeals - 1;
  const isLunch = (totalMeals <= 4 && mealIndex === 1) || (totalMeals >= 5 && mealIndex === 2);
  const is2Meal = totalMeals === 2;
  const d = (profile && profile.diet) ? profile.diet : {};

  let options;

  if (d.isCarnivore) {
    if (is2Meal) options = mealIndex === 0 ? getCarnivoreLunchOptions(protein, carbs, fats) : getCarnivoreDinnerOptions(protein, carbs, fats);
    else if (isBreakfast) options = getCarnivoreBreakfastOptions(protein, carbs, fats);
    else if (isDinner) options = getCarnivoreDinnerOptions(protein, carbs, fats);
    else if (isLunch) options = getCarnivoreLunchOptions(protein, carbs, fats);
    else options = getCarnivoreSnackOptions(protein, carbs, fats);
  } else if (d.isVegan) {
    if (is2Meal) options = mealIndex === 0 ? getVeganLunchOptions(protein, carbs, fats) : getVeganDinnerOptions(protein, carbs, fats);
    else if (isBreakfast) options = getVeganBreakfastOptions(protein, carbs, fats);
    else if (isDinner) options = getVeganDinnerOptions(protein, carbs, fats);
    else if (isLunch) options = getVeganLunchOptions(protein, carbs, fats);
    else options = getVeganSnackOptions(protein, carbs, fats);
  } else if (d.isVegetarian) {
    if (is2Meal) options = mealIndex === 0 ? getVegetarianLunchOptions(protein, carbs, fats) : getVegetarianDinnerOptions(protein, carbs, fats);
    else if (isBreakfast) options = getVegetarianBreakfastOptions(protein, carbs, fats);
    else if (isDinner) options = getVegetarianDinnerOptions(protein, carbs, fats);
    else if (isLunch) options = getVegetarianLunchOptions(protein, carbs, fats);
    else options = getVegetarianSnackOptions(protein, carbs, fats);
  } else if (d.isLowCarb || d.isKeto) {
    if (is2Meal) options = mealIndex === 0 ? getLowCarbLunchOptions(protein, carbs, fats) : getLowCarbDinnerOptions(protein, carbs, fats);
    else if (isBreakfast) options = getLowCarbBreakfastOptions(protein, carbs, fats);
    else if (isDinner) options = getLowCarbDinnerOptions(protein, carbs, fats);
    else if (isLunch) options = getLowCarbLunchOptions(protein, carbs, fats);
    else options = getLowCarbSnackOptions(protein, carbs, fats);
  } else {
    if (is2Meal) options = mealIndex === 0 ? getBrunchOptions(protein, carbs, fats) : getLargeDinnerOptions(protein, carbs, fats);
    else if (isBreakfast) options = getBreakfastOptions(protein, carbs, fats);
    else if (isDinner) options = getDinnerOptions(protein, carbs, fats);
    else if (isLunch) options = getLunchOptions(protein, carbs, fats);
    else options = getSnackOptions(protein, carbs, fats);
  }

  options = filterMealOptions(options, profile);

  // Always return exactly 3 options — cycle if fewer remain after filtering
  while (options.length < 3) options = [...options, ...options];
  return options.slice(0, 3);
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

// ─── VEGAN MEAL OPTIONS ────────────────────────────────────────────────────

function getVeganBreakfastOptions(p, c, f) {
  return [
    {
      title: 'Tofu Scramble with Avocado Toast',
      ingredients: [
        `${Math.round(p * 0.85 / 0.08)}g firm tofu, crumbled`,
        `${Math.max(1, Math.round(c * 0.45 / 0.43 / 28))} slices whole grain bread, toasted`,
        `${Math.round(f * 0.4 / 0.15)}g avocado`,
        '1 cup spinach',
        '1/2 cup mushrooms, sliced',
        '1/4 cup cherry tomatoes, halved',
        `${Math.round(f * 0.3 / 0.92)} tsp olive oil`,
        '1 tsp turmeric, garlic powder, salt',
      ],
      instructions: [
        'Heat olive oil in a nonstick skillet over medium heat.',
        'Sauté mushrooms and tomatoes 3 minutes until soft.',
        'Add crumbled tofu, turmeric, garlic powder, and salt. Cook 5 minutes, stirring.',
        'Add spinach and stir until wilted, 1–2 minutes.',
        'Toast bread and spread with mashed avocado. Serve scramble on top or alongside.',
      ],
    },
    {
      title: 'Overnight Oats with Hemp Seeds & Berries',
      ingredients: [
        `${Math.round(c * 0.55 / 0.60)}g rolled oats (dry)`,
        '1 scoop plant protein powder (~20g protein)',
        '1 cup unsweetened oat milk',
        '1/2 cup mixed berries',
        `${Math.round(f * 0.4 / 0.31)}g hemp seeds`,
        '1 tbsp chia seeds',
        '1 tsp maple syrup or agave',
      ],
      instructions: [
        'In a jar, combine oats, plant protein, oat milk, chia seeds, and maple syrup. Stir well.',
        'Refrigerate overnight (at least 6 hours).',
        'In the morning, stir and add a splash of oat milk if too thick.',
        'Top with mixed berries and hemp seeds before eating.',
      ],
    },
    {
      title: 'Green Protein Smoothie Bowl',
      ingredients: [
        '1 scoop plant protein powder (~20g protein)',
        `${Math.round(c * 0.3 / 0.14)}g banana (fresh or frozen)`,
        '1 cup frozen mango chunks',
        '1 cup baby spinach',
        '1/2 cup unsweetened almond milk',
        `${Math.round(f * 0.35 / 0.31)}g hemp seeds`,
        `${Math.round(f * 0.3 / 0.50)}g almonds, sliced`,
        '1/4 cup low-sugar granola',
      ],
      instructions: [
        'Blend protein powder, banana, mango, spinach, and almond milk until very smooth.',
        'Consistency should be thick — use less liquid if needed.',
        'Pour into a bowl.',
        'Top with hemp seeds, sliced almonds, and granola.',
      ],
    },
  ];
}

function getVeganLunchOptions(p, c, f) {
  return [
    {
      title: 'Lentil & Quinoa Power Bowl',
      ingredients: [
        `${Math.round(p * 0.6 / 0.09)}g cooked lentils`,
        `${Math.round(c * 0.4 / 0.21)}g cooked quinoa`,
        `${Math.round(f * 0.35 / 0.15)}g avocado, sliced`,
        '1 cup steamed broccoli',
        '1/2 cup roasted sweet potato cubes',
        '2 tbsp tahini',
        '1 tbsp lemon juice, cumin, salt, paprika',
      ],
      instructions: [
        'Cook lentils in salted water 20 minutes until tender. Season with cumin and paprika.',
        'Cook quinoa per package directions.',
        'Roast sweet potato cubes at 400°F / 200°C for 20 minutes.',
        'Steam broccoli 4 minutes until tender-crisp.',
        'Assemble bowl. Drizzle tahini mixed with lemon juice over the top. Add avocado.',
      ],
    },
    {
      title: 'Tempeh Stir-Fry with Brown Rice',
      ingredients: [
        `${Math.round(p * 0.8 / 0.19)}g tempeh, cubed`,
        `${Math.round(c * 0.5 / 0.28)}g cooked brown rice`,
        '1 cup mixed vegetables (broccoli, snap peas, carrots)',
        `${Math.round(f * 0.3 / 0.50)}g cashews`,
        '1 tbsp low-sodium soy sauce or tamari',
        '1 tsp sesame oil, 1 clove garlic, 1 tsp grated ginger',
      ],
      instructions: [
        'Heat sesame oil in a wok or skillet over high heat.',
        'Add tempeh cubes and stir-fry until golden on all sides, 4–5 minutes.',
        'Add garlic and ginger. Stir 30 seconds.',
        'Add vegetables and stir-fry 3–4 minutes.',
        'Add soy sauce and cashews. Toss well. Serve over brown rice.',
      ],
    },
    {
      title: 'Chickpea Wrap with Tahini',
      ingredients: [
        `${Math.round(p * 0.7 / 0.09)}g canned chickpeas, rinsed and drained`,
        `${Math.max(1, Math.round(c * 0.3 / 0.43 / 28))} large whole wheat tortillas`,
        '1 cup mixed greens',
        '1/2 cup cucumber, diced',
        '1/2 cup cherry tomatoes, halved',
        `${Math.round(f * 0.4 / 0.30)}g hummus`,
        '2 tbsp tahini + lemon juice + cumin, paprika, salt',
      ],
      instructions: [
        'Season chickpeas with cumin, paprika, and salt. Pan-fry 5 minutes until slightly crispy.',
        'Warm tortilla in a dry skillet 30 seconds each side.',
        'Spread hummus on the tortilla.',
        'Layer greens, chickpeas, cucumber, and tomatoes.',
        'Drizzle tahini and lemon juice. Roll tightly and slice in half.',
      ],
    },
  ];
}

function getVeganDinnerOptions(p, c, f) {
  return [
    {
      title: 'Red Lentil Curry with Basmati Rice',
      ingredients: [
        `${Math.round(p * 0.7 / 0.09)}g dry red lentils`,
        `${Math.round(c * 0.45 / 0.28)}g cooked basmati rice`,
        '1 can (400ml) light coconut milk',
        '1 cup diced tomatoes',
        '1 onion diced, 2 cloves garlic, 1 tsp grated ginger',
        `${Math.round(f * 0.2 / 0.92)} tsp coconut oil`,
        '1 tsp each: curry powder, cumin, turmeric, garam masala, salt',
      ],
      instructions: [
        'Heat coconut oil in a pot. Sauté onion until soft, 5 minutes. Add garlic, ginger, and spices, 1 minute.',
        'Add lentils, coconut milk, tomatoes, and 1 cup water.',
        'Simmer 20–25 minutes, stirring occasionally, until lentils are completely soft.',
        'Season with salt. Serve over basmati rice.',
      ],
    },
    {
      title: 'Black Bean & Sweet Potato Bowl',
      ingredients: [
        `${Math.round(p * 0.65 / 0.089)}g canned black beans, rinsed`,
        `${Math.round(c * 0.4 / 0.20)}g sweet potato, cubed and roasted`,
        `${Math.round(c * 0.2 / 0.21)}g cooked quinoa`,
        `${Math.round(f * 0.4 / 0.15)}g avocado`,
        '2 tbsp salsa or pico de gallo',
        '1 tbsp lime juice, cumin, paprika, salt',
        '1 cup chopped romaine or mixed greens',
      ],
      instructions: [
        'Toss sweet potato cubes with olive oil, cumin, and paprika. Roast at 425°F / 220°C for 25 minutes.',
        'Warm black beans in a pan with lime juice and salt.',
        'Cook quinoa per package directions.',
        'Assemble: quinoa base, black beans, sweet potato, greens, avocado, salsa.',
      ],
    },
    {
      title: 'Tofu & Vegetable Noodle Stir-Fry',
      ingredients: [
        `${Math.round(p * 0.85 / 0.08)}g extra firm tofu, pressed and cubed`,
        `${Math.round(c * 0.45 / 0.25)}g rice noodles or soba noodles (dry)`,
        '1 cup bok choy or baby spinach',
        '1/2 cup bell peppers, sliced',
        '2 tbsp low-sodium soy sauce or tamari',
        `${Math.round(f * 0.35 / 0.50)}g peanuts or cashews`,
        '1 tsp sesame oil, 1 clove garlic, 1 tsp ginger',
      ],
      instructions: [
        'Press tofu 15 minutes to remove moisture. Cube.',
        'Cook noodles per package directions. Drain and rinse.',
        'Heat sesame oil in a wok. Stir-fry tofu until golden, 5–6 minutes.',
        'Add garlic, ginger, vegetables. Stir-fry 3–4 minutes.',
        'Toss in noodles and soy sauce. Top with nuts. Serve hot.',
      ],
    },
  ];
}

function getVeganSnackOptions(p, c, f) {
  return [
    {
      title: 'Plant Protein Shake & Fruit',
      ingredients: [
        '1 scoop plant protein powder (~20g protein)',
        '1 cup unsweetened oat milk or almond milk',
        `${Math.round(c * 0.4 / 0.14)}g banana`,
        '1/2 cup frozen berries',
        `${Math.round(f * 0.3 / 0.31)}g hemp seeds`,
      ],
      instructions: [
        'Add all ingredients to a blender.',
        'Blend until smooth.',
        'Drink immediately or store chilled for up to 4 hours.',
      ],
    },
    {
      title: 'Hummus & Veggie Plate with Hemp Seeds',
      ingredients: [
        `${Math.round(p * 0.5 / 0.089)}g hummus`,
        '1 cup raw vegetables (carrots, celery, cucumber, bell pepper sticks)',
        `${Math.round(f * 0.4 / 0.31)}g hemp seeds (stirred into hummus)`,
        `${Math.max(1, Math.round(c * 0.3 / 0.10))} brown rice cakes`,
        '1 tsp olive oil drizzle',
      ],
      instructions: [
        'Slice vegetables into sticks.',
        'Stir hemp seeds into hummus for extra protein.',
        'Arrange vegetables and rice cakes around the hummus bowl.',
        'Drizzle olive oil over hummus.',
      ],
    },
    {
      title: 'Edamame with Almond Butter & Apple',
      ingredients: [
        `${Math.round(p * 0.6 / 0.11)}g shelled edamame`,
        `${Math.round(f * 0.5 / 0.50)}g almond butter`,
        '1 medium apple, sliced',
        'Pinch of sea salt and cinnamon',
      ],
      instructions: [
        'Steam or microwave edamame until warm. Season with sea salt.',
        'Slice apple and dust lightly with cinnamon.',
        'Serve edamame alongside apple slices with almond butter for dipping.',
      ],
    },
  ];
}

// ─── VEGETARIAN MEAL OPTIONS ───────────────────────────────────────────────

function getVegetarianBreakfastOptions(p, c, f) {
  return [
    {
      title: 'Veggie Egg Scramble with Toast',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.7 / 6))} whole eggs`,
        `${Math.round(p * 0.2 / 0.10)}g nonfat Greek yogurt (side)`,
        '1 cup spinach',
        '1/2 cup mushrooms, sliced',
        '1/4 cup cherry tomatoes, halved',
        `${Math.max(1, Math.round(c * 0.4 / 0.43 / 28))} slices whole grain bread, toasted`,
        `${Math.round(f * 0.35 / 0.15)}g avocado`,
        '1 tsp olive oil, salt, pepper',
      ],
      instructions: [
        'Heat olive oil in a nonstick skillet over medium heat.',
        'Sauté mushrooms and tomatoes 2–3 minutes.',
        'Whisk eggs and pour over vegetables. Add spinach. Scramble until just set.',
        'Toast bread. Serve scramble on toast with avocado. Greek yogurt on the side.',
      ],
    },
    {
      title: 'Greek Yogurt Protein Parfait',
      ingredients: [
        `${Math.round(p * 0.65 / 0.10)}g nonfat Greek yogurt`,
        '1 scoop vanilla protein powder (optional)',
        `${Math.round(c * 0.5 / 0.70)}g low-sugar granola`,
        '1/2 cup mixed berries',
        `${Math.round(f * 0.4 / 0.65)}g walnuts, chopped`,
        '1 tbsp honey',
        '1 tbsp chia seeds',
      ],
      instructions: [
        'Mix Greek yogurt with protein powder if using.',
        'Layer yogurt, granola, and berries in a glass or bowl.',
        'Top with walnuts, chia seeds, and a drizzle of honey.',
        'Serve immediately or prep the night before (add granola in the morning).',
      ],
    },
    {
      title: 'Avocado Toast with Poached Eggs',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.55 / 6))} whole eggs`,
        `${Math.max(1, Math.round(c * 0.5 / 0.43 / 28))} slices whole grain bread`,
        `${Math.round(f * 0.45 / 0.15)}g avocado`,
        '1/4 cup cherry tomatoes, halved',
        `${Math.round(p * 0.25 / 0.10)}g cottage cheese (spread or side)`,
        '1 tsp lemon juice, salt, pepper, red pepper flakes',
      ],
      instructions: [
        'Toast bread until golden and crispy.',
        'Mash avocado with lemon juice, salt, and pepper.',
        'Bring water to a gentle simmer. Crack eggs in — poach 3–4 minutes. Alternatively fry.',
        'Spread avocado on toast. Top with egg and tomatoes. Season with red pepper flakes.',
        'Add cottage cheese on the side for extra protein.',
      ],
    },
  ];
}

function getVegetarianLunchOptions(p, c, f) {
  return [
    {
      title: 'Egg Fried Quinoa with Vegetables',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.45 / 6))} whole eggs`,
        `${Math.round(p * 0.3 / 0.10)}g Greek yogurt (side)`,
        `${Math.round(c * 0.55 / 0.21)}g cooked quinoa`,
        '1 cup mixed vegetables (peas, carrots, corn, bell pepper)',
        '1 tbsp low-sodium soy sauce',
        '1 tsp sesame oil, 1 clove garlic, 2 green onions sliced',
      ],
      instructions: [
        'Heat sesame oil in a large pan or wok over high heat.',
        'Add garlic and stir 30 seconds. Add quinoa and stir-fry 2–3 minutes.',
        'Push quinoa to the side. Scramble eggs in the center until just set.',
        'Mix everything with vegetables and soy sauce.',
        'Top with green onions. Serve with Greek yogurt on the side.',
      ],
    },
    {
      title: 'Caprese Quinoa Bowl',
      ingredients: [
        `${Math.round(c * 0.5 / 0.21)}g cooked quinoa`,
        `${Math.round(p * 0.55 / 0.22)}g fresh mozzarella, sliced`,
        '1 cup cherry tomatoes, halved',
        '1 cup fresh basil leaves',
        `${Math.round(f * 0.4 / 0.15)}g avocado, sliced`,
        `${Math.round(f * 0.3 / 0.92)} tsp olive oil`,
        '1 tbsp balsamic glaze, salt, pepper',
      ],
      instructions: [
        'Cook quinoa per package directions. Allow to cool slightly.',
        'Arrange quinoa in a bowl.',
        'Layer mozzarella, tomatoes, basil, and avocado on top.',
        'Drizzle olive oil and balsamic glaze. Season well.',
      ],
    },
    {
      title: 'Cottage Cheese Power Bowl',
      ingredients: [
        `${Math.round(p * 0.7 / 0.11)}g low-fat cottage cheese`,
        `${Math.round(c * 0.4 / 0.20)}g sweet potato, cubed and roasted`,
        `${Math.round(c * 0.2 / 0.28)}g cooked brown rice`,
        '1 cup steamed broccoli',
        `${Math.round(f * 0.35 / 0.15)}g avocado`,
        '1 tbsp olive oil, salt, pepper, garlic powder',
      ],
      instructions: [
        'Roast sweet potato cubes at 400°F / 200°C for 20 minutes with olive oil.',
        'Steam broccoli 4 minutes until tender-crisp.',
        'Cook brown rice per package directions.',
        'Assemble: rice base, sweet potato, broccoli, avocado, and a large scoop of cottage cheese.',
        'Season with salt, pepper, and garlic powder.',
      ],
    },
  ];
}

function getVegetarianDinnerOptions(p, c, f) {
  return [
    {
      title: 'Chickpea & Vegetable Curry with Rice',
      ingredients: [
        `${Math.round(p * 0.65 / 0.09)}g canned chickpeas, drained`,
        `${Math.round(c * 0.45 / 0.28)}g cooked basmati rice`,
        '1 cup diced tomatoes',
        '1/3 cup light coconut milk',
        '1 cup mixed vegetables (spinach, zucchini, peas)',
        '1 onion diced, 2 cloves garlic',
        '1 tsp each: curry powder, garam masala, turmeric',
        `${Math.round(f * 0.2 / 0.92)} tsp olive oil`,
      ],
      instructions: [
        'Sauté onion and garlic in olive oil over medium heat until soft, 5 minutes.',
        'Add spices and cook 1 minute until fragrant.',
        'Add chickpeas, tomatoes, coconut milk, and vegetables.',
        'Simmer 15–20 minutes until thickened. Season with salt.',
        'Serve over basmati rice.',
      ],
    },
    {
      title: 'Whole Wheat Pasta with Eggs & Parmesan',
      ingredients: [
        `${Math.round(c * 0.5 / 0.25)}g whole wheat pasta (dry)`,
        `${Math.max(2, Math.round(p * 0.4 / 6))} whole eggs`,
        `${Math.round(p * 0.3 / 0.35)}g Parmesan, grated`,
        `${Math.round(p * 0.2 / 0.11)}g cottage cheese`,
        '1 cup cherry tomatoes and 1 cup spinach',
        `${Math.round(f * 0.4 / 0.92)} tsp olive oil`,
        '2 cloves garlic minced, salt, pepper, fresh basil',
      ],
      instructions: [
        'Cook pasta al dente per package directions. Reserve 1/4 cup pasta water.',
        'Sauté garlic in olive oil. Add tomatoes until soft. Add spinach.',
        'Whisk eggs with Parmesan. Remove pan from heat.',
        'Add pasta, then egg mixture, then pasta water. Toss quickly — residual heat cooks the egg.',
        'Stir in cottage cheese. Top with basil and extra Parmesan.',
      ],
    },
    {
      title: 'Stuffed Bell Peppers with Quinoa & Cheese',
      ingredients: [
        '3–4 bell peppers, halved and seeded',
        `${Math.round(c * 0.4 / 0.21)}g cooked quinoa`,
        `${Math.round(p * 0.5 / 0.09)}g canned black beans, drained`,
        `${Math.round(p * 0.3 / 0.22)}g shredded mozzarella`,
        '1/2 cup diced tomatoes',
        '1 tsp cumin, chili powder, salt',
        `${Math.round(f * 0.2 / 0.92)} tsp olive oil`,
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C.',
        'Mix quinoa, black beans, diced tomatoes, and spices.',
        'Stuff mixture into halved bell peppers placed in a baking dish.',
        'Top generously with shredded mozzarella.',
        'Bake 25–30 minutes until peppers are tender and cheese is golden.',
      ],
    },
  ];
}

function getVegetarianSnackOptions(p, c, f) {
  return [
    {
      title: 'Greek Yogurt with Fruit & Nuts',
      ingredients: [
        `${Math.round(p * 0.75 / 0.10)}g nonfat Greek yogurt`,
        '1/2 cup mixed berries',
        `${Math.round(f * 0.5 / 0.50)}g mixed nuts`,
        '1 tsp honey',
        '1 tsp chia seeds',
      ],
      instructions: [
        'Scoop yogurt into a bowl.',
        'Top with berries, mixed nuts, and chia seeds.',
        'Drizzle honey. Serve immediately or keep refrigerated.',
      ],
    },
    {
      title: 'Hard Boiled Eggs with Avocado & Raw Veggies',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.7 / 6))} hard boiled eggs`,
        `${Math.round(f * 0.5 / 0.15)}g avocado, sliced`,
        '1 cup raw vegetables (carrots, celery, cucumber)',
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Hard boil eggs: place in cold water, bring to boil, cook 9–10 minutes. Cool in ice water.',
        'Peel and halve eggs. Season with salt, pepper, and paprika.',
        'Serve alongside avocado slices and raw vegetables.',
      ],
    },
    {
      title: 'Cottage Cheese & Fruit Bowl',
      ingredients: [
        `${Math.round(p * 0.75 / 0.11)}g low-fat cottage cheese`,
        '1/2 cup pineapple or peach chunks',
        `${Math.round(f * 0.5 / 0.50)}g mixed nuts`,
        '1 tsp chia seeds',
      ],
      instructions: [
        'Scoop cottage cheese into a bowl.',
        'Top with fruit chunks, mixed nuts, and chia seeds.',
        'Mix gently and serve chilled.',
      ],
    },
  ];
}

// ─── LOW-CARB / KETO MEAL OPTIONS ─────────────────────────────────────────

function getLowCarbBreakfastOptions(p, c, f) {
  return [
    {
      title: 'Spinach & Feta Omelet',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.75 / 6))} whole eggs`,
        `${Math.round(p * 0.2 / 0.14)}g feta cheese, crumbled`,
        '1 cup fresh spinach',
        '1/4 cup cherry tomatoes, halved',
        '2 tbsp diced onion',
        `${Math.round(f * 0.35 / 0.92)} tsp olive oil or butter`,
        'Salt, pepper, Italian seasoning',
      ],
      instructions: [
        'Whisk eggs with salt and pepper.',
        'Heat oil or butter in a nonstick skillet over medium heat.',
        'Pour in eggs. When edges begin to set, add spinach, tomatoes, and feta to one half.',
        'Fold omelet in half. Cook 1 more minute until center is set.',
        'Slide onto a plate and serve immediately.',
      ],
    },
    {
      title: 'Smoked Salmon & Avocado Plate',
      ingredients: [
        `${Math.round(p * 0.65 / 0.20)}g smoked salmon`,
        `${Math.max(2, Math.round(p * 0.3 / 6))} hard boiled eggs`,
        `${Math.round(f * 0.45 / 0.15)}g avocado, sliced`,
        '1/4 red onion, thinly sliced',
        '1 tbsp capers',
        'Fresh dill, lemon juice',
        `${Math.round(p * 0.1 / 0.34)}g cream cheese (optional)`,
      ],
      instructions: [
        'Arrange smoked salmon, halved hard boiled eggs, and avocado on a plate.',
        'Scatter red onion and capers.',
        'Squeeze lemon juice over salmon. Garnish with fresh dill.',
        'Add cream cheese on the side if using.',
      ],
    },
    {
      title: 'Bacon & Egg Cups',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.65 / 6))} whole eggs`,
        `${Math.round(p * 0.3 / 0.35)}g bacon (2–4 strips)`,
        `${Math.round(p * 0.1 / 0.07)}g shredded cheddar`,
        '1/4 cup diced bell pepper, 2 tbsp diced onion',
        'Salt, pepper, garlic powder',
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C. Lightly grease a muffin tin.',
        'Cook bacon until pliable (not crispy). Line muffin cups with one strip each.',
        'Add diced pepper and onion into each cup.',
        'Crack one egg per cup. Season. Top with shredded cheddar.',
        'Bake 15–18 minutes until eggs are set to your liking.',
      ],
    },
  ];
}

function getLowCarbLunchOptions(p, c, f) {
  return [
    {
      title: 'Ground Beef Lettuce Wraps',
      ingredients: [
        `${Math.round(p * 0.8 / 0.26)}g lean ground beef (90% lean)`,
        '6–8 large butter lettuce leaves',
        '1/4 cup diced tomatoes',
        '2 tbsp diced onion',
        `${Math.round(f * 0.3 / 0.15)}g avocado, sliced`,
        `${Math.round(p * 0.1 / 0.07)}g shredded cheese`,
        '1 tsp olive oil, cumin, chili powder, salt',
      ],
      instructions: [
        'Brown ground beef in olive oil over medium-high heat. Season with cumin, chili powder, and salt.',
        'Drain any excess fat.',
        'Spoon meat into lettuce leaves.',
        'Top with tomatoes, onion, avocado, and shredded cheese.',
        'Serve immediately.',
      ],
    },
    {
      title: 'Grilled Chicken Caesar Salad',
      ingredients: [
        `${Math.round(p * 0.85 / 0.31)}g chicken breast`,
        '3 cups romaine lettuce, chopped',
        `${Math.round(p * 0.1 / 0.35)}g Parmesan, grated`,
        `${Math.round(f * 0.5 / 0.48)}g Caesar dressing (no croutons)`,
        `${Math.round(f * 0.2 / 0.50)}g almonds or walnuts`,
        'Salt, pepper, lemon juice',
      ],
      instructions: [
        'Season chicken with salt and pepper. Grill or pan-sear 5–6 minutes per side until cooked through.',
        'Rest 5 minutes, then slice.',
        'Toss romaine with Caesar dressing and a squeeze of lemon.',
        'Top with sliced chicken, Parmesan, and nuts.',
      ],
    },
    {
      title: 'Tuna-Stuffed Avocado',
      ingredients: [
        `${Math.round(p * 0.8 / 0.26)}g canned tuna in water, drained`,
        `${Math.max(1, Math.round(f * 0.6 / 0.15 / 200))} avocados, halved and pitted`,
        '2 tbsp avocado oil mayonnaise',
        '2 tbsp celery, finely diced',
        '1 tbsp red onion, finely diced',
        '1 tsp Dijon mustard, lemon juice',
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Mix tuna with mayo, celery, onion, mustard, and lemon juice.',
        'Season with salt and pepper.',
        'Scoop a little extra avocado and mash into the tuna mixture.',
        'Fill avocado halves generously.',
        'Sprinkle paprika on top and serve.',
      ],
    },
  ];
}

function getLowCarbDinnerOptions(p, c, f) {
  return [
    {
      title: 'Sirloin Steak with Roasted Vegetables',
      ingredients: [
        `${Math.round(p * 0.85 / 0.26)}g sirloin steak`,
        '2 cups roasted low-carb vegetables (zucchini, asparagus, bell peppers)',
        `${Math.round(f * 0.4 / 0.81)}g butter`,
        '2 cloves garlic minced, fresh rosemary',
        'Salt, pepper, 1 tsp olive oil',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C. Toss vegetables with olive oil and salt. Roast 20–22 minutes.',
        'Season steak generously with salt and pepper.',
        'Heat a cast iron pan until very hot. Sear steak 3–4 min per side for medium rare.',
        'Add butter and garlic to pan. Baste steak for 1 minute.',
        'Rest 5 minutes before slicing. Serve with roasted vegetables.',
      ],
    },
    {
      title: 'Baked Salmon with Asparagus & Cauliflower Rice',
      ingredients: [
        `${Math.round(p * 0.85 / 0.25)}g salmon fillet`,
        `${Math.round(c * 0.8 / 0.05)}g cauliflower, riced`,
        '1.5 cups asparagus spears',
        `${Math.round(f * 0.35 / 0.92)} tsp olive oil`,
        `${Math.round(f * 0.25 / 0.81)}g butter`,
        'Lemon, dill, garlic, salt, pepper',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Season salmon with olive oil, dill, lemon juice, salt, and pepper.',
        'Bake salmon 12–15 minutes until flaky.',
        'Sauté riced cauliflower in butter with garlic 5–7 minutes. Season well.',
        'Steam or roast asparagus 6–8 minutes. Plate and serve everything together.',
      ],
    },
    {
      title: 'Chicken Thighs with Zucchini & Pesto',
      ingredients: [
        `${Math.round(p * 0.85 / 0.25)}g boneless chicken thighs`,
        '2 large zucchini, spiralized or sliced',
        `${Math.round(f * 0.45 / 0.48)}g basil pesto`,
        '1 cup cherry tomatoes, halved',
        `${Math.round(p * 0.1 / 0.35)}g Parmesan, grated`,
        '1 tsp olive oil, salt, pepper, Italian seasoning',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Season chicken thighs with salt, pepper, and Italian seasoning.',
        'Sear skin-side down in an oven-safe skillet 5 minutes. Flip and roast 20–25 minutes.',
        'Sauté zucchini and tomatoes in olive oil 4–5 minutes.',
        'Toss zucchini with pesto. Plate with chicken. Top with Parmesan.',
      ],
    },
  ];
}

function getLowCarbSnackOptions(p, c, f) {
  return [
    {
      title: 'Cheese, Almonds & Deli Meat',
      ingredients: [
        `${Math.round(p * 0.4 / 0.07)}g cheddar or gouda cheese`,
        `${Math.round(f * 0.4 / 0.50)}g almonds`,
        `${Math.round(p * 0.4 / 0.35)}g deli turkey or roast beef`,
        '1/2 cup celery or cucumber sticks',
      ],
      instructions: [
        'Slice cheese into cubes or strips.',
        'Arrange cheese, almonds, deli meat, and vegetables on a plate or container.',
        'Store in the fridge if not eating immediately.',
      ],
    },
    {
      title: 'Hard Boiled Eggs with Avocado',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.8 / 6))} hard boiled eggs`,
        `${Math.round(f * 0.5 / 0.15)}g avocado, sliced`,
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Hard boil eggs: place in cold water, bring to boil, cook 9–10 minutes.',
        'Cool in ice water, peel, and halve.',
        'Season with salt, pepper, and paprika.',
        'Serve alongside sliced avocado.',
      ],
    },
    {
      title: 'Beef Jerky with Celery & Almond Butter',
      ingredients: [
        `${Math.round(p * 0.65 / 0.35)}g beef jerky (no added sugar)`,
        '4 stalks celery, cut into sticks',
        `${Math.round(f * 0.5 / 0.50)}g almond butter`,
        `${Math.round(f * 0.2 / 0.65)}g walnuts`,
      ],
      instructions: [
        'Fill celery stalks with almond butter.',
        'Arrange on a plate alongside beef jerky and walnuts.',
        'Serve as is — great for on-the-go.',
      ],
    },
  ];
}

// ─── CARNIVORE MEAL OPTIONS ────────────────────────────────────────────────

function getCarnivoreBreakfastOptions(p, c, f) {
  return [
    {
      title: 'Ground Beef & Fried Eggs',
      ingredients: [
        `${Math.round(p * 0.6 / 0.26)}g lean ground beef`,
        `${Math.max(2, Math.round(p * 0.4 / 6))} whole eggs`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Brown ground beef in a skillet over medium-high heat. Season with salt. Drain excess fat.',
        'In the same skillet, melt butter and fry eggs to your preference.',
        'Plate beef alongside eggs. Eat while warm.',
      ],
    },
    {
      title: 'Bacon & Fried Eggs',
      ingredients: [
        `${Math.round(p * 0.5 / 0.35)}g bacon`,
        `${Math.max(3, Math.round(p * 0.5 / 6))} whole eggs`,
        `${Math.round(f * 0.15 / 0.81)}g butter (optional)`,
        'Salt',
      ],
      instructions: [
        'Cook bacon in a skillet over medium heat until crispy. Remove and set aside.',
        'Fry eggs in the remaining bacon fat or butter.',
        'Plate bacon and eggs together. Season with salt.',
      ],
    },
    {
      title: 'Ribeye Steak & Eggs',
      ingredients: [
        `${Math.round(p * 0.65 / 0.27)}g ribeye steak`,
        `${Math.max(2, Math.round(p * 0.35 / 6))} whole eggs`,
        `${Math.round(f * 0.35 / 0.81)}g butter`,
        'Salt, fresh rosemary (optional)',
      ],
      instructions: [
        'Bring steak to room temperature 15 minutes before cooking. Season generously with salt.',
        'Heat a cast iron skillet until very hot. Sear steak 3–4 min per side.',
        'Add butter and rosemary. Baste steak 1 minute. Rest 5 minutes.',
        'Fry eggs in the same pan with remaining butter. Plate together.',
      ],
    },
  ];
}

function getCarnivoreLunchOptions(p, c, f) {
  return [
    {
      title: 'Ground Beef Patties with Butter',
      ingredients: [
        `${Math.round(p * 0.85 / 0.26)}g lean ground beef (formed into 2–3 patties)`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        `${Math.round(p * 0.1 / 0.07)}g cheddar (optional, melted on top)`,
        'Salt, pepper',
      ],
      instructions: [
        'Form ground beef into even patties. Season with salt and pepper.',
        'Heat a skillet or grill pan over high heat.',
        'Cook patties 4–5 minutes per side until cooked through.',
        'Add cheese in the last minute if using. Serve hot with butter melted on top.',
      ],
    },
    {
      title: 'Chicken Thighs & Crispy Bacon',
      ingredients: [
        `${Math.round(p * 0.7 / 0.25)}g bone-in skin-on chicken thighs`,
        `${Math.round(p * 0.25 / 0.35)}g bacon`,
        `${Math.round(f * 0.25 / 0.81)}g butter`,
        'Salt, garlic powder (optional)',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Season chicken with salt. Sear skin-side down in butter 5 minutes until golden.',
        'Flip and roast in the oven 20–25 minutes until internal temp reaches 165°F / 74°C.',
        'Cook bacon in a separate pan until crispy.',
        'Plate chicken alongside bacon.',
      ],
    },
    {
      title: 'Pan-Seared Salmon & Fried Eggs',
      ingredients: [
        `${Math.round(p * 0.65 / 0.25)}g salmon fillet`,
        `${Math.max(2, Math.round(p * 0.35 / 6))} whole eggs`,
        `${Math.round(f * 0.4 / 0.81)}g butter`,
        'Salt, lemon juice (optional)',
      ],
      instructions: [
        'Pat salmon dry. Season with salt.',
        'Melt half the butter in a skillet over medium-high heat.',
        'Sear salmon skin-side up 4 minutes, flip, cook 3–4 more minutes.',
        'Remove salmon. Add remaining butter and fry eggs.',
        'Plate salmon and eggs. Add a squeeze of lemon if desired.',
      ],
    },
  ];
}

function getCarnivoreDinnerOptions(p, c, f) {
  return [
    {
      title: 'NY Strip Steak with Herb Butter',
      ingredients: [
        `${Math.round(p * 0.9 / 0.27)}g NY strip steak`,
        `${Math.round(f * 0.5 / 0.81)}g butter`,
        '2 cloves garlic (optional)',
        'Fresh rosemary or thyme (optional)',
        'Salt',
      ],
      instructions: [
        'Bring steak to room temperature. Season very generously with salt.',
        'Heat a cast iron pan until smoking hot. Sear steak 3–4 min per side for medium rare.',
        'Add butter and garlic to the pan. Baste the steak continuously for 1 minute.',
        'Rest on a plate 5–8 minutes before cutting.',
        'Drizzle pan butter over steak when serving.',
      ],
    },
    {
      title: 'Roasted Chicken with Pan Drippings',
      ingredients: [
        `${Math.round(p * 0.9 / 0.27)}g bone-in skin-on chicken pieces`,
        `${Math.round(f * 0.35 / 0.81)}g butter, softened`,
        'Salt, garlic powder (optional)',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C.',
        'Rub chicken all over with softened butter and season generously with salt.',
        'Place skin-side up in a roasting pan or oven-safe skillet.',
        'Roast 35–45 minutes until skin is golden and internal temp is 165°F / 74°C.',
        'Serve with all the pan drippings poured on top.',
      ],
    },
    {
      title: 'Baked Salmon with Beef Patty',
      ingredients: [
        `${Math.round(p * 0.5 / 0.25)}g salmon fillet`,
        `${Math.round(p * 0.45 / 0.26)}g lean ground beef (1 patty)`,
        `${Math.round(f * 0.45 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Season salmon with salt. Bake 12–15 minutes until flaky.',
        'Form ground beef into a patty, season with salt. Pan-sear 4–5 min per side.',
        'Melt butter in the salmon pan and drizzle over both proteins.',
        'Plate together and serve hot.',
      ],
    },
  ];
}

function getCarnivoreSnackOptions(p, c, f) {
  return [
    {
      title: 'Beef Jerky & Cheese',
      ingredients: [
        `${Math.round(p * 0.65 / 0.35)}g beef jerky (no added sugar)`,
        `${Math.round(f * 0.5 / 0.33)}g cheddar or gouda, sliced`,
        `${Math.round(p * 0.15 / 0.35)}g hard salami or pepperoni`,
      ],
      instructions: [
        'Slice cheese if needed.',
        'Arrange beef jerky, cheese, and cured meat on a plate.',
        'No prep needed — great for meal prep.',
      ],
    },
    {
      title: 'Hard Boiled Eggs with Cheese',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.7 / 6))} hard boiled eggs`,
        `${Math.round(f * 0.4 / 0.33)}g cheddar cheese`,
        `${Math.round(p * 0.1 / 0.35)}g bacon bits (optional)`,
        'Salt',
      ],
      instructions: [
        'Hard boil eggs: place in cold water, bring to boil, cook 9–10 minutes.',
        'Cool in ice water, peel, and halve. Season with salt.',
        'Serve alongside cheddar slices and bacon bits.',
      ],
    },
    {
      title: 'Crispy Bacon & Fried Eggs',
      ingredients: [
        `${Math.round(p * 0.55 / 0.35)}g bacon`,
        `${Math.max(1, Math.round(p * 0.45 / 6))} whole eggs`,
        `${Math.round(f * 0.2 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Cook bacon in a skillet until crispy. Set aside on paper towels.',
        'Fry eggs in remaining fat or butter until set.',
        'Serve together, seasoned with salt.',
      ],
    },
  ];
}

// --- Swap Option Pools (extras beyond the initial A/B/C) ---

function getBreakfastSwapOptions(p, c, f) {
  return [
    {
      title: 'Turkey Bacon & Spinach Egg Muffins',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.7 / 6))} whole eggs`,
        `${Math.round(p * 0.25 / 0.35)}g turkey bacon`,
        '1 cup baby spinach, roughly chopped',
        '1/4 cup diced red bell pepper',
        `${Math.round(p * 0.1 / 0.07)}g shredded mozzarella`,
        'Salt, pepper, garlic powder',
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C. Grease a 6-cup muffin tin.',
        'Cook turkey bacon until slightly crispy. Chop into small pieces.',
        'Whisk eggs with salt, pepper, and garlic powder.',
        'Divide spinach, bell pepper, and turkey bacon among muffin cups.',
        'Pour egg mixture over. Top with mozzarella. Bake 18–20 minutes until set.',
      ],
    },
    {
      title: 'Peanut Butter Banana Protein Smoothie',
      ingredients: [
        '1 scoop vanilla whey protein powder (~25g protein)',
        `${Math.round(c * 0.45 / 0.14)}g banana (fresh or frozen)`,
        `${Math.round(f * 0.5 / 6)}g natural peanut butter`,
        '1 cup unsweetened almond milk',
        '1/2 cup ice cubes',
        '1 tsp honey (optional)',
      ],
      instructions: [
        'Add all ingredients to a blender.',
        'Blend 45–60 seconds until completely smooth.',
        'Taste and add honey if more sweetness is needed.',
        'Drink immediately — best served cold.',
      ],
    },
    {
      title: 'Smoked Salmon Scrambled Eggs',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.55 / 6))} whole eggs`,
        `${Math.round(p * 0.35 / 0.20)}g smoked salmon, roughly torn`,
        `${Math.round(f * 0.35 / 0.92)} tsp butter`,
        '2 tbsp cream cheese (light)',
        '1 tbsp fresh chives or dill, chopped',
        'Black pepper, lemon zest',
      ],
      instructions: [
        'Whisk eggs with a pinch of pepper.',
        'Melt butter over low heat. Pour in eggs and stir slowly with a spatula.',
        'When eggs are almost set, stir in cream cheese until just melted.',
        'Remove from heat. Fold in smoked salmon and chives.',
        'Serve immediately with a squeeze of lemon zest.',
      ],
    },
  ];
}

function getLunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Shrimp & Brown Rice Stir-Fry',
      ingredients: [
        `${Math.round(p * 0.85 / 0.24)}g raw shrimp, peeled and deveined`,
        `${Math.round(c * 0.55 / 0.28)}g cooked brown rice`,
        '1 cup mixed vegetables (snap peas, carrots, bok choy)',
        '1 tbsp low-sodium soy sauce',
        '1 tsp sesame oil, 2 cloves garlic, 1 tsp grated ginger',
        `${Math.round(f * 0.4 / 0.92)} tsp avocado oil`,
      ],
      instructions: [
        'Season shrimp with a pinch of salt and pepper.',
        'Heat avocado oil in a wok or large skillet over high heat.',
        'Stir-fry shrimp 2–3 minutes until pink. Remove and set aside.',
        'Add garlic and ginger to the pan, stir 30 seconds. Add vegetables, stir-fry 3 minutes.',
        'Return shrimp. Add soy sauce and sesame oil. Toss and serve over rice.',
      ],
    },
    {
      title: 'Beef & Veggie Whole Wheat Wrap',
      ingredients: [
        `${Math.round(p * 0.75 / 0.26)}g lean ground beef (90% lean)`,
        `${Math.max(1, Math.round(c * 0.4 / 0.43 / 28))} large whole wheat tortillas`,
        '1 cup shredded romaine lettuce',
        '1/2 cup diced tomatoes',
        '2 tbsp Greek yogurt (as sour cream sub)',
        `${Math.round(f * 0.4 / 0.15)}g avocado, sliced`,
        '1 tsp cumin, chili powder, salt',
      ],
      instructions: [
        'Brown ground beef in a skillet. Season with cumin, chili powder, and salt.',
        'Warm tortilla in a dry pan 30 seconds each side.',
        'Layer beef, lettuce, tomatoes, and avocado down the center.',
        'Add a dollop of Greek yogurt. Roll tightly and slice in half.',
      ],
    },
    {
      title: 'Egg Salad Stuffed Bell Peppers',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.8 / 6))} hard boiled eggs`,
        '2 large bell peppers, halved and seeded',
        '1 tbsp avocado oil mayonnaise',
        '1 tsp Dijon mustard',
        '2 tbsp celery, finely diced',
        '1 tbsp chives, chopped',
        `${Math.round(c * 0.5 / 0.5)}g cooked quinoa (stirred into salad)`,
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Hard boil eggs: boil 10 minutes, cool in ice water, peel.',
        'Chop eggs and mix with mayo, mustard, celery, chives, and quinoa.',
        'Season well with salt, pepper, and paprika.',
        'Spoon filling generously into bell pepper halves.',
        'Serve immediately or refrigerate and eat cold.',
      ],
    },
  ];
}

function getDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Turkey Meatballs with Zucchini Noodles',
      ingredients: [
        `${Math.round(p * 0.85 / 0.29)}g lean ground turkey`,
        '2 large zucchini, spiralized',
        `${Math.round(c * 0.4 / 0.10)}g crushed tomatoes (canned)`,
        `${Math.round(p * 0.1 / 0.07)}g Parmesan, grated`,
        '2 cloves garlic, 1/4 onion finely diced',
        '1 egg, Italian seasoning, salt, pepper',
        `${Math.round(f * 0.3 / 0.92)} tsp olive oil`,
      ],
      instructions: [
        'Mix turkey with egg, half the garlic, Parmesan, Italian seasoning, salt, and pepper. Form into balls.',
        'Brown meatballs in olive oil 6–8 minutes, turning. Transfer to a plate.',
        'Sauté onion and remaining garlic 3 minutes. Add crushed tomatoes. Simmer 10 minutes.',
        'Return meatballs to sauce, simmer 8 more minutes until cooked through.',
        'Sauté zucchini noodles in a separate pan 2–3 minutes. Serve meatballs and sauce on top.',
      ],
    },
    {
      title: 'Shrimp & Broccoli Brown Rice Bowl',
      ingredients: [
        `${Math.round(p * 0.85 / 0.24)}g large shrimp, peeled and deveined`,
        `${Math.round(c * 0.55 / 0.28)}g cooked brown rice`,
        '2 cups broccoli florets',
        '1 tbsp oyster sauce or hoisin sauce',
        `${Math.round(f * 0.4 / 0.92)} tsp sesame oil`,
        '2 cloves garlic, 1 tsp grated ginger',
        '1 tsp sesame seeds (garnish)',
      ],
      instructions: [
        'Blanch broccoli in boiling water 3 minutes. Drain.',
        'Heat sesame oil in a wok. Add garlic and ginger, stir 30 seconds.',
        'Add shrimp. Cook 2–3 minutes until pink, stirring.',
        'Add broccoli and oyster sauce. Toss well, cook 1 more minute.',
        'Serve over brown rice. Sprinkle sesame seeds.',
      ],
    },
    {
      title: 'Pork Tenderloin with Sweet Potato & Apple',
      ingredients: [
        `${Math.round(p * 0.85 / 0.31)}g pork tenderloin`,
        `${Math.round(c * 0.55 / 0.20)}g sweet potato, cubed`,
        '1 apple, cored and sliced',
        `${Math.round(f * 0.35 / 0.81)}g butter`,
        '2 cloves garlic, fresh rosemary',
        '1 tsp olive oil, salt, pepper, paprika',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C. Toss sweet potato with olive oil and paprika. Roast 20 minutes.',
        'Season pork with salt, pepper, garlic, and rosemary.',
        'Sear pork in butter in an oven-safe skillet 3 minutes per side until browned.',
        'Transfer to oven and roast 12–15 minutes until internal temp is 145°F / 63°C.',
        'Rest 5 minutes. Add apple slices to the skillet drippings and sauté 3 minutes.',
        'Slice pork and serve with sweet potato and caramelised apple.',
      ],
    },
  ];
}

function getSnackSwapOptions(p, c, f) {
  return [
    {
      title: 'Tuna on Whole Grain Rice Cakes',
      ingredients: [
        `${Math.round(p * 0.75 / 0.26)}g canned tuna in water, drained`,
        `${Math.max(2, Math.round(c * 0.5 / 8))} plain brown rice cakes`,
        '1 tbsp avocado oil mayo',
        '1 tsp Dijon mustard',
        '1/4 cup cucumber, thinly sliced',
        'Salt, pepper, lemon juice',
      ],
      instructions: [
        'Mix tuna with mayo, mustard, lemon juice, salt, and pepper.',
        'Layer cucumber slices on each rice cake.',
        'Spoon tuna mixture on top.',
        'Eat immediately — best when tuna is fresh.',
      ],
    },
    {
      title: 'Hard Boiled Eggs with Mixed Nuts',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.7 / 6))} hard boiled eggs`,
        `${Math.round(f * 0.6 / 0.50)}g mixed nuts (almonds, walnuts, cashews)`,
        `${Math.round(c * 0.5 / 0.14)}g banana or a piece of fruit`,
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Hard boil eggs if not already prepared.',
        'Peel and halve. Season with salt, pepper, and paprika.',
        'Portion nuts into a small container.',
        'Serve eggs alongside nuts and fruit for a balanced protein-fat-carb snack.',
      ],
    },
    {
      title: 'Turkey Roll-Ups with Cheese & Veggies',
      ingredients: [
        `${Math.round(p * 0.65 / 0.35)}g sliced deli turkey breast`,
        `${Math.round(f * 0.4 / 0.33)}g Swiss or provolone cheese, sliced`,
        '1/2 cup baby spinach leaves',
        '1/4 cup roasted red pepper strips',
        '1 tsp Dijon mustard per roll-up',
        `${Math.round(c * 0.5 / 0.10)} small whole grain crackers`,
      ],
      instructions: [
        'Lay out a slice of turkey. Place a slice of cheese on top.',
        'Add a few spinach leaves and roasted pepper.',
        'Spread Dijon mustard, then roll tightly.',
        'Secure with a toothpick if needed. Repeat.',
        'Serve with crackers on the side.',
      ],
    },
  ];
}

function getBrunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Shakshuka with Crusty Bread',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.7 / 6))} whole eggs`,
        `${Math.round(c * 0.4 / 0.5)}g whole grain sourdough, sliced`,
        '1 can (400g) crushed tomatoes',
        '1/2 onion diced, 2 cloves garlic, 1/2 red bell pepper diced',
        '1 tsp cumin, 1 tsp paprika, pinch of cayenne',
        `${Math.round(f * 0.3 / 0.92)} tsp olive oil`,
        'Fresh parsley or cilantro to garnish',
      ],
      instructions: [
        'Heat olive oil in a wide skillet. Sauté onion and pepper 5 minutes.',
        'Add garlic and spices. Cook 1 minute.',
        'Pour in crushed tomatoes. Simmer 8–10 minutes until sauce thickens.',
        'Make wells in the sauce. Crack eggs into wells. Cover and cook 6–8 minutes.',
        'Garnish with parsley. Serve with crusty bread for dipping.',
      ],
    },
    {
      title: 'Mexican Breakfast Bowl',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.5 / 6))} whole eggs, scrambled`,
        `${Math.round(p * 0.3 / 0.089)}g canned black beans, rinsed`,
        `${Math.round(c * 0.4 / 0.28)}g cooked brown rice`,
        `${Math.round(f * 0.4 / 0.15)}g avocado, sliced`,
        '3 tbsp salsa or pico de gallo',
        '1 tbsp olive oil, cumin, salt',
        'Fresh lime juice and cilantro',
      ],
      instructions: [
        'Warm black beans in a small pan with cumin and salt.',
        'Scramble eggs in olive oil over medium heat.',
        'Warm rice if needed.',
        'Layer rice, black beans, and eggs in a bowl.',
        'Top with avocado, salsa, lime juice, and cilantro.',
      ],
    },
    {
      title: 'Chia Seed Pudding Protein Bowl',
      ingredients: [
        '4 tbsp chia seeds',
        '1 scoop vanilla protein powder (~25g protein)',
        '1.5 cups unsweetened almond milk',
        `${Math.round(c * 0.4 / 0.14)}g banana, sliced`,
        `${Math.round(f * 0.4 / 0.50)}g almond or cashew butter`,
        '1/2 cup mixed berries',
        '1 tsp maple syrup or honey',
      ],
      instructions: [
        'Whisk protein powder into almond milk until smooth.',
        'Stir in chia seeds. Mix well to prevent clumping.',
        'Refrigerate at least 4 hours or overnight.',
        'Stir pudding before serving. It should be thick and gel-like.',
        'Top with banana, berries, and nut butter. Drizzle maple syrup.',
      ],
    },
  ];
}

function getLargeDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Baked Cod with Herb Quinoa & Roasted Tomatoes',
      ingredients: [
        `${Math.round(p * 0.85 / 0.20)}g cod fillet`,
        `${Math.round(c * 0.5 / 0.21)}g cooked quinoa`,
        '1 cup cherry tomatoes, halved',
        'Fresh parsley, dill, lemon juice',
        `${Math.round(f * 0.4 / 0.92)} tsp olive oil`,
        '2 cloves garlic, salt, pepper',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Season cod with olive oil, garlic, lemon juice, dill, salt, and pepper.',
        'Arrange cod and cherry tomatoes on a baking sheet.',
        'Roast 15–18 minutes until cod flakes easily with a fork and tomatoes blister.',
        'Toss quinoa with parsley, lemon zest, salt, and olive oil. Serve alongside cod.',
      ],
    },
    {
      title: 'Lamb Chops with Cauliflower Mash & Greens',
      ingredients: [
        `${Math.round(p * 0.85 / 0.25)}g lamb loin chops`,
        `${Math.round(c * 0.6 / 0.05)}g cauliflower, florets`,
        '2 cups baby spinach or arugula',
        `${Math.round(f * 0.4 / 0.81)}g butter`,
        '2 cloves garlic, fresh rosemary, lemon juice',
        'Salt, pepper, 1 tsp olive oil',
      ],
      instructions: [
        'Season lamb with salt, pepper, garlic, and rosemary.',
        'Boil cauliflower until very tender, 12 minutes. Drain and mash with butter, salt, and pepper.',
        'Heat a skillet until hot. Sear lamb 3–4 min per side for medium. Rest 5 minutes.',
        'Wilt spinach in the same pan with a touch of olive oil and lemon juice.',
        'Plate cauliflower mash, lamb chops, and wilted greens.',
      ],
    },
    {
      title: 'Chicken Marsala with Roasted Potatoes',
      ingredients: [
        `${Math.round(p * 0.85 / 0.31)}g chicken breast, pounded thin`,
        `${Math.round(c * 0.5 / 0.17)}g baby potatoes, halved`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        '1/2 cup Marsala wine or chicken broth',
        '1 cup mushrooms, sliced',
        '2 cloves garlic, fresh thyme',
        '1 tsp olive oil, salt, pepper, flour (light dusting)',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C. Toss potatoes with olive oil and salt. Roast 25 minutes.',
        'Dust chicken with flour and season with salt and pepper.',
        'Sear chicken in butter 3–4 min per side until golden. Remove.',
        'Add mushrooms and garlic to pan, cook 4 minutes. Add Marsala and thyme, simmer 3 minutes.',
        'Return chicken to sauce. Simmer 3 more minutes. Serve with roasted potatoes.',
      ],
    },
  ];
}

function getVeganBreakfastSwapOptions(p, c, f) {
  return [
    {
      title: 'Chia Seed Pudding with Coconut & Berries',
      ingredients: [
        '4 tbsp chia seeds',
        '1 scoop plant protein powder (~20g protein)',
        '1.5 cups coconut milk (light, carton) or oat milk',
        '1/2 cup mixed berries',
        `${Math.round(f * 0.35 / 0.31)}g hemp seeds`,
        '1 tbsp unsweetened shredded coconut',
        '1 tsp agave or maple syrup',
      ],
      instructions: [
        'Whisk plant protein into coconut milk until smooth.',
        'Stir in chia seeds. Mix well. Refrigerate 6 hours or overnight.',
        'Stir before serving — should be thick and creamy.',
        'Top with berries, hemp seeds, shredded coconut, and agave.',
      ],
    },
    {
      title: 'Savory Chickpea Flour Pancakes',
      ingredients: [
        `${Math.round(c * 0.5 / 0.57)}g chickpea flour (besan)`,
        `${Math.round(p * 0.2 / 0.08)}g extra-firm tofu, crumbled (batter mix-in)`,
        '1/2 cup water',
        '1/4 cup spinach, finely chopped',
        '1/4 red onion, finely diced',
        `${Math.round(f * 0.35 / 0.92)} tsp olive oil`,
        '1 tsp cumin, turmeric, salt, pepper',
      ],
      instructions: [
        'Whisk chickpea flour with water, cumin, turmeric, and salt until smooth.',
        'Stir in crumbled tofu, spinach, and red onion.',
        'Heat a nonstick skillet with olive oil over medium heat.',
        'Pour 1/4 cup batter per pancake. Cook 3–4 min per side until golden.',
        'Serve with salsa, hummus, or avocado on the side.',
      ],
    },
    {
      title: 'Peanut Butter Banana Smoothie Bowl',
      ingredients: [
        '1 scoop plant protein powder (~20g protein)',
        `${Math.round(c * 0.35 / 0.14)}g frozen banana`,
        `${Math.round(f * 0.45 / 0.53)}g natural peanut butter`,
        '1/2 cup unsweetened oat milk (use less for thick bowl)',
        `${Math.round(c * 0.2 / 0.60)}g rolled oats (granola topping)`,
        '2 tbsp hemp seeds',
        '1/2 cup sliced strawberries',
      ],
      instructions: [
        'Blend protein powder, frozen banana, peanut butter, and oat milk until very thick.',
        'Add only as much milk as needed — bowl consistency should hold a spoon upright.',
        'Pour into a bowl.',
        'Top with granola, hemp seeds, and strawberries.',
      ],
    },
  ];
}

function getVeganLunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Black Bean Tacos with Corn Tortillas',
      ingredients: [
        `${Math.round(p * 0.65 / 0.089)}g canned black beans, rinsed`,
        `${Math.max(2, Math.round(c * 0.4 / 0.23 / 28))} small corn tortillas`,
        `${Math.round(f * 0.4 / 0.15)}g avocado, sliced`,
        '1/2 cup red cabbage, shredded',
        '1/2 cup mango salsa or pico de gallo',
        '1 tbsp lime juice, cumin, chili powder, salt',
        '2 tbsp tahini or vegan sour cream',
      ],
      instructions: [
        'Season black beans with cumin, chili powder, and salt. Warm in a pan 3–4 minutes.',
        'Warm corn tortillas in a dry skillet 30 seconds per side.',
        'Assemble: beans, red cabbage, avocado, and mango salsa in each tortilla.',
        'Drizzle tahini and lime juice over the top.',
        'Serve 2–3 tacos per person.',
      ],
    },
    {
      title: 'Edamame Soba Noodle Bowl',
      ingredients: [
        `${Math.round(c * 0.55 / 0.25)}g soba noodles (dry)`,
        `${Math.round(p * 0.7 / 0.11)}g shelled edamame`,
        '1 cup shredded red cabbage',
        '1/2 cup shredded carrots',
        '2 tbsp low-sodium soy sauce or tamari',
        `${Math.round(f * 0.4 / 0.50)}g sesame tahini`,
        '1 tsp sesame oil, 1 tbsp rice vinegar, 1 tsp grated ginger',
      ],
      instructions: [
        'Cook soba noodles per package directions. Rinse under cold water.',
        'Steam edamame 4–5 minutes until warm.',
        'Whisk soy sauce, tahini, sesame oil, rice vinegar, and ginger into a dressing.',
        'Toss noodles with dressing, cabbage, carrots, and edamame.',
        'Serve at room temperature or chilled. Sprinkle sesame seeds if desired.',
      ],
    },
    {
      title: 'Roasted Cauliflower & Chickpea Power Bowl',
      ingredients: [
        `${Math.round(p * 0.6 / 0.089)}g canned chickpeas, rinsed`,
        `${Math.round(c * 0.45 / 0.05)}g cauliflower florets`,
        `${Math.round(c * 0.2 / 0.21)}g cooked quinoa`,
        `${Math.round(f * 0.35 / 0.30)}g hummus`,
        '2 cups mixed greens',
        '2 tbsp lemon juice, 1 tsp cumin, paprika, salt',
        `${Math.round(f * 0.2 / 0.92)} tsp olive oil`,
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C.',
        'Toss chickpeas and cauliflower with olive oil, cumin, paprika, and salt.',
        'Spread on a baking sheet. Roast 25–28 minutes until golden and slightly crispy.',
        'Assemble bowl: quinoa base, mixed greens, roasted cauliflower and chickpeas.',
        'Dollop hummus on the side. Drizzle lemon juice over everything.',
      ],
    },
  ];
}

function getVeganDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Chickpea & Spinach Tikka Masala',
      ingredients: [
        `${Math.round(p * 0.7 / 0.089)}g canned chickpeas, rinsed`,
        `${Math.round(c * 0.45 / 0.28)}g cooked basmati rice`,
        '1 can (400ml) light coconut milk',
        '1 can (400g) diced tomatoes',
        '2 cups baby spinach',
        '1 onion diced, 3 cloves garlic, 1 tsp ginger',
        `${Math.round(f * 0.2 / 0.92)} tsp coconut oil`,
        '2 tsp garam masala, 1 tsp cumin, 1 tsp turmeric, 1 tsp paprika, salt',
      ],
      instructions: [
        'Heat coconut oil. Sauté onion 5 minutes. Add garlic, ginger, and spices. Cook 1 minute.',
        'Add tomatoes and coconut milk. Simmer 10 minutes.',
        'Add chickpeas and simmer 15 more minutes until sauce thickens.',
        'Stir in spinach and cook until just wilted, 2 minutes.',
        'Season with salt. Serve over basmati rice.',
      ],
    },
    {
      title: 'Mushroom & Walnut Bolognese with Pasta',
      ingredients: [
        `${Math.round(c * 0.5 / 0.35)}g whole wheat pasta (dry)`,
        `${Math.round(p * 0.4 / 0.032)}g mushrooms (cremini or portobello), finely diced`,
        `${Math.round(f * 0.45 / 0.50)}g walnuts, finely chopped`,
        '1 can (400g) crushed tomatoes',
        '1/2 onion diced, 3 cloves garlic, 2 tbsp tomato paste',
        `${Math.round(f * 0.15 / 0.92)} tsp olive oil`,
        '1 tsp Italian seasoning, salt, pepper, splash of red wine (optional)',
      ],
      instructions: [
        'Heat olive oil. Sauté onion 5 minutes. Add garlic and tomato paste, cook 1 minute.',
        'Add mushrooms. Cook over high heat 8–10 minutes until all moisture evaporates.',
        'Stir in walnuts. Add crushed tomatoes, red wine (optional), Italian seasoning.',
        'Simmer 20 minutes, stirring occasionally, until rich and thick. Season with salt.',
        'Cook pasta per package directions. Serve sauce over pasta.',
      ],
    },
    {
      title: 'Sweet Potato & Black Bean Enchilada Bowl',
      ingredients: [
        `${Math.round(p * 0.55 / 0.089)}g canned black beans, rinsed`,
        `${Math.round(c * 0.4 / 0.20)}g sweet potato, cubed and roasted`,
        `${Math.round(c * 0.2 / 0.21)}g cooked brown rice`,
        '1/2 cup enchilada sauce (red)',
        `${Math.round(f * 0.4 / 0.15)}g avocado, sliced`,
        '1/4 cup diced red onion',
        'Cilantro, lime juice, cumin, salt',
      ],
      instructions: [
        'Roast sweet potato with cumin and salt at 425°F / 220°C for 25 minutes.',
        'Warm black beans in a pan with a splash of enchilada sauce.',
        'Assemble bowls: rice, black beans, sweet potato.',
        'Drizzle enchilada sauce generously over the top.',
        'Finish with avocado, red onion, cilantro, and lime juice.',
      ],
    },
  ];
}

function getVeganSnackSwapOptions(p, c, f) {
  return [
    {
      title: 'Roasted Chickpeas & Dried Apricots',
      ingredients: [
        `${Math.round(p * 0.6 / 0.089)}g canned chickpeas, rinsed and dried`,
        `${Math.round(c * 0.4 / 0.65)}g dried apricots`,
        `${Math.round(f * 0.35 / 0.50)}g mixed nuts`,
        '1 tsp olive oil, cumin, paprika, salt',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Toss dried chickpeas with olive oil, cumin, paprika, and salt.',
        'Spread on a baking sheet. Roast 25–30 minutes until very crispy, shaking halfway through.',
        'Cool completely (they crisp up further as they cool).',
        'Mix with apricots and nuts. Store in an airtight container up to 3 days.',
      ],
    },
    {
      title: 'No-Bake Peanut Butter Energy Balls',
      ingredients: [
        `${Math.round(f * 0.45 / 0.53)}g natural peanut butter`,
        `${Math.round(c * 0.5 / 0.60)}g rolled oats`,
        '2 tbsp hemp seeds',
        '2 tbsp dark chocolate chips (dairy-free)',
        '2 tbsp maple syrup',
        '1 scoop plant protein powder',
      ],
      instructions: [
        'Mix all ingredients together in a bowl until fully combined.',
        'If mixture is too dry, add 1 tsp water at a time.',
        'Roll into bite-sized balls (about 1 tbsp each).',
        'Place on a lined tray and refrigerate 30 minutes until firm.',
        'Store in an airtight container in the fridge up to 1 week.',
      ],
    },
    {
      title: 'Apple Slices with Tahini & Hemp Seeds',
      ingredients: [
        '1 large apple, sliced',
        `${Math.round(f * 0.5 / 0.30)}g tahini`,
        `${Math.round(p * 0.5 / 0.31)}g hemp seeds`,
        '1 tsp lemon juice',
        'Pinch of cinnamon',
      ],
      instructions: [
        'Slice apple into thin wedges.',
        'Mix tahini with lemon juice and a splash of water to make a dippable sauce.',
        'Arrange apple slices on a plate.',
        'Drizzle tahini over apples or serve on the side.',
        'Sprinkle hemp seeds and cinnamon over the top.',
      ],
    },
  ];
}

function getVegetarianBreakfastSwapOptions(p, c, f) {
  return [
    {
      title: 'Banana French Toast with Ricotta',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.4 / 6))} whole eggs`,
        `${Math.max(1, Math.round(c * 0.4 / 0.43 / 28))} slices whole grain bread`,
        `${Math.round(p * 0.4 / 0.11)}g part-skim ricotta`,
        `${Math.round(c * 0.25 / 0.14)}g banana, sliced`,
        '1/2 cup mixed berries',
        '1 tsp vanilla extract, cinnamon',
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        '1 tsp honey or maple syrup',
      ],
      instructions: [
        'Whisk eggs with vanilla and cinnamon.',
        'Dip bread slices in egg mixture, coating both sides.',
        'Melt butter in a nonstick pan over medium heat. Cook bread 2–3 min per side until golden.',
        'Top French toast with a generous dollop of ricotta.',
        'Layer banana slices and berries on top. Drizzle honey.',
      ],
    },
    {
      title: 'Spinach & Mushroom Baked Frittata',
      ingredients: [
        `${Math.max(4, Math.round(p * 0.75 / 6))} whole eggs`,
        `${Math.round(p * 0.2 / 0.07)}g shredded mozzarella`,
        '1.5 cups mushrooms, sliced',
        '2 cups fresh spinach',
        '2 tbsp diced onion',
        `${Math.round(f * 0.3 / 0.92)} tsp olive oil`,
        'Salt, pepper, Italian seasoning',
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C.',
        'Sauté onion and mushrooms in olive oil 5 minutes. Add spinach and wilt 1 minute.',
        'Whisk eggs with salt, pepper, and Italian seasoning.',
        'Pour eggs over vegetables in an oven-safe skillet.',
        'Top with mozzarella. Bake 18–20 minutes until set in the center. Slice and serve.',
      ],
    },
    {
      title: 'Mango Lassi Protein Bowl',
      ingredients: [
        `${Math.round(p * 0.7 / 0.10)}g full-fat Greek yogurt`,
        `${Math.round(c * 0.45 / 0.13)}g frozen mango chunks`,
        '1/2 cup unsweetened almond milk',
        `${Math.round(f * 0.35 / 0.50)}g mixed nuts, chopped`,
        '2 tbsp coconut flakes (unsweetened)',
        '1 tsp honey or agave',
        'Pinch of cardamom',
      ],
      instructions: [
        'Blend yogurt, mango, almond milk, and cardamom until smooth.',
        'Pour into a bowl — should be thicker than a smoothie.',
        'Top with mixed nuts, coconut flakes, and a drizzle of honey.',
        'Serve immediately while cold.',
      ],
    },
  ];
}

function getVegetarianLunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Caprese Quinoa Salad',
      ingredients: [
        `${Math.round(c * 0.45 / 0.21)}g cooked quinoa`,
        `${Math.round(p * 0.6 / 0.18)}g fresh mozzarella, torn`,
        '1 cup cherry tomatoes, halved',
        '1 cup fresh basil leaves',
        `${Math.round(f * 0.45 / 0.92)} tsp extra virgin olive oil`,
        '1 tbsp balsamic glaze',
        'Salt, pepper, lemon juice',
      ],
      instructions: [
        'Cook quinoa per package directions. Spread on a plate to cool.',
        'Arrange quinoa, mozzarella, and tomatoes in a bowl or on a platter.',
        'Tuck basil leaves throughout.',
        'Drizzle olive oil and balsamic glaze. Season with salt, pepper, and lemon juice.',
        'Toss gently and serve at room temperature.',
      ],
    },
    {
      title: 'Egg Salad Sandwich on Whole Grain',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.8 / 6))} hard boiled eggs`,
        `${Math.max(2, Math.round(c * 0.5 / 0.43 / 28))} slices whole grain bread`,
        '1 tbsp avocado oil mayonnaise',
        '1 tsp Dijon mustard',
        '2 tbsp celery, finely diced',
        '1 tbsp chives or dill',
        `${Math.round(f * 0.3 / 0.15)}g avocado, sliced`,
        'Salt, pepper, paprika',
      ],
      instructions: [
        'Chop hard boiled eggs and mix with mayo, mustard, celery, and chives.',
        'Season with salt, pepper, and paprika.',
        'Toast bread if desired.',
        'Spread egg salad on one slice. Layer avocado on top.',
        'Close sandwich and slice. Serve with a side salad if desired.',
      ],
    },
    {
      title: 'Palak Paneer with Brown Rice',
      ingredients: [
        `${Math.round(p * 0.65 / 0.18)}g paneer, cubed`,
        `${Math.round(c * 0.45 / 0.28)}g cooked brown rice`,
        '2 cups fresh spinach, wilted and blended',
        '1/2 cup diced tomatoes',
        '1/2 onion diced, 2 cloves garlic, 1 tsp ginger',
        `${Math.round(f * 0.3 / 0.92)} tsp ghee or butter`,
        '1 tsp cumin, garam masala, coriander, salt',
      ],
      instructions: [
        'Pan-fry paneer cubes in ghee until golden on all sides, 5–6 minutes. Set aside.',
        'In the same pan, sauté onion 4 minutes. Add garlic, ginger, and spices.',
        'Add tomatoes and cook 3 minutes. Stir in blended spinach.',
        'Simmer sauce 5 minutes. Add paneer and coat in sauce.',
        'Serve over brown rice.',
      ],
    },
  ];
}

function getVegetarianDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Eggplant Parmesan with Pasta',
      ingredients: [
        `${Math.round(c * 0.35 / 0.35)}g whole wheat pasta (dry)`,
        '1 large eggplant, sliced into rounds',
        `${Math.round(p * 0.55 / 0.25)}g part-skim ricotta`,
        `${Math.round(p * 0.2 / 0.07)}g mozzarella, shredded`,
        `${Math.round(p * 0.1 / 0.35)}g Parmesan, grated`,
        '1 can (400g) crushed tomatoes, seasoned with basil and garlic',
        '2 eggs, beaten (for breading)',
        'Breadcrumbs or almond flour, olive oil spray, salt, pepper',
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C. Salt eggplant slices 10 minutes, pat dry.',
        'Dip eggplant in beaten egg, coat in breadcrumbs. Spray with olive oil. Bake 20 minutes, flipping once.',
        'Layer in a baking dish: tomato sauce, eggplant, ricotta, mozzarella. Repeat.',
        'Top with Parmesan. Bake 25 minutes until bubbly and golden.',
        'Cook pasta per directions. Serve eggplant parm over pasta.',
      ],
    },
    {
      title: 'Mushroom & Parmesan Risotto',
      ingredients: [
        `${Math.round(c * 0.55 / 0.36)}g Arborio rice (dry)`,
        `${Math.round(p * 0.5 / 0.032)}g mixed mushrooms (cremini, shiitake), sliced`,
        `${Math.round(p * 0.35 / 0.35)}g Parmesan, grated`,
        `${Math.round(f * 0.35 / 0.81)}g butter`,
        '1/2 onion finely diced, 2 cloves garlic',
        '1/2 cup dry white wine or extra broth',
        '4 cups warm vegetable broth',
        'Salt, pepper, fresh thyme',
      ],
      instructions: [
        'Sauté mushrooms in half the butter over high heat 6 minutes until golden. Set aside.',
        'In the same pot, cook onion and garlic 4 minutes. Add rice and stir 1 minute.',
        'Add wine and stir until absorbed. Add broth one ladle at a time, stirring constantly.',
        'Continue adding broth, stirring 18–20 minutes until rice is creamy and al dente.',
        'Stir in remaining butter, Parmesan, and mushrooms. Season generously.',
      ],
    },
    {
      title: 'Paneer Tikka Masala with Basmati Rice',
      ingredients: [
        `${Math.round(p * 0.7 / 0.18)}g paneer, cubed`,
        `${Math.round(c * 0.45 / 0.28)}g cooked basmati rice`,
        '1 can (400ml) light coconut milk or heavy cream',
        '1 can (400g) crushed tomatoes',
        '1 onion diced, 3 cloves garlic, 1 tsp grated ginger',
        `${Math.round(f * 0.2 / 0.81)}g butter or ghee`,
        '2 tsp garam masala, 1 tsp cumin, 1 tsp coriander, 1 tsp paprika, salt',
      ],
      instructions: [
        'Pan-fry paneer cubes in ghee until golden. Set aside.',
        'Sauté onion 5 minutes. Add garlic, ginger, and all spices. Cook 1 minute.',
        'Add crushed tomatoes. Simmer 10 minutes.',
        'Add coconut milk or cream. Simmer 5 more minutes.',
        'Add paneer. Simmer 8 minutes. Serve over basmati rice.',
      ],
    },
  ];
}

function getVegetarianSnackSwapOptions(p, c, f) {
  return [
    {
      title: 'Ricotta & Honey on Rice Cakes',
      ingredients: [
        `${Math.round(p * 0.7 / 0.11)}g part-skim ricotta`,
        `${Math.max(2, Math.round(c * 0.4 / 8))} plain rice cakes`,
        '1/2 cup sliced strawberries or raspberries',
        `${Math.round(f * 0.4 / 0.50)}g walnuts, chopped`,
        '1 tsp honey',
        'Pinch of cinnamon',
      ],
      instructions: [
        'Spread ricotta generously on each rice cake.',
        'Top with sliced berries.',
        'Sprinkle walnuts and cinnamon.',
        'Drizzle honey. Eat immediately.',
      ],
    },
    {
      title: 'Caprese Skewers with Balsamic',
      ingredients: [
        `${Math.round(p * 0.65 / 0.18)}g fresh mozzarella balls (ciliegine)`,
        '1 cup cherry tomatoes',
        '1 cup fresh basil leaves',
        `${Math.round(f * 0.5 / 0.92)} tsp extra virgin olive oil`,
        '1 tbsp balsamic glaze',
        'Salt and black pepper',
        `${Math.round(c * 0.5 / 0.10)} whole grain crackers`,
      ],
      instructions: [
        'Thread onto small skewers: basil leaf, cherry tomato, mozzarella ball. Repeat.',
        'Arrange on a plate.',
        'Drizzle olive oil and balsamic glaze over the top.',
        'Season with salt and black pepper.',
        'Serve with whole grain crackers on the side.',
      ],
    },
    {
      title: 'No-Bake Peanut Butter Protein Balls',
      ingredients: [
        `${Math.round(f * 0.45 / 0.53)}g natural peanut butter`,
        `${Math.round(c * 0.5 / 0.60)}g rolled oats`,
        '1 scoop vanilla protein powder',
        '2 tbsp honey',
        '2 tbsp mini dark chocolate chips',
        '1 tbsp chia seeds',
      ],
      instructions: [
        'Mix all ingredients in a bowl until a thick dough forms.',
        'If too dry, add 1 tsp milk at a time.',
        'Roll into 1 tbsp-sized balls.',
        'Refrigerate on a lined tray for 20–30 minutes until firm.',
        'Store in the fridge up to 1 week. Makes 6–8 balls.',
      ],
    },
  ];
}

function getLowCarbBreakfastSwapOptions(p, c, f) {
  return [
    {
      title: 'Prosciutto-Wrapped Asparagus & Fried Eggs',
      ingredients: [
        `${Math.max(2, Math.round(p * 0.45 / 6))} whole eggs`,
        `${Math.round(p * 0.35 / 0.25)}g prosciutto`,
        '8–10 asparagus spears, woody ends snapped off',
        `${Math.round(f * 0.4 / 0.81)}g butter`,
        'Salt, pepper, lemon zest',
      ],
      instructions: [
        'Preheat oven to 400°F / 200°C.',
        'Wrap each asparagus spear with a strip of prosciutto. Place on a baking sheet.',
        'Roast 12–15 minutes until prosciutto is crispy and asparagus is tender.',
        'Meanwhile, fry eggs in butter to your liking.',
        'Plate eggs alongside asparagus wraps. Season with salt, pepper, and lemon zest.',
      ],
    },
    {
      title: 'Keto Chia Pudding with Berries',
      ingredients: [
        '4 tbsp chia seeds',
        '1.5 cups unsweetened coconut milk (carton)',
        `${Math.round(p * 0.4 / 0.10)}g full-fat Greek yogurt (stirred in)`,
        '1/2 cup mixed berries',
        `${Math.round(f * 0.4 / 0.50)}g macadamia nuts or walnuts`,
        '1 tsp vanilla extract',
        '1 tsp erythritol or stevia (optional)',
      ],
      instructions: [
        'Whisk chia seeds, coconut milk, vanilla, and sweetener. Stir in Greek yogurt.',
        'Refrigerate 6+ hours or overnight until thickened.',
        'Stir well before serving.',
        'Top with berries and macadamia nuts.',
      ],
    },
    {
      title: 'Chorizo & Bell Pepper Scramble',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.55 / 6))} whole eggs`,
        `${Math.round(p * 0.4 / 0.24)}g chorizo (cured or fresh), sliced or crumbled`,
        '1/2 red bell pepper, diced',
        '2 tbsp diced onion',
        `${Math.round(f * 0.2 / 0.92)} tsp olive oil`,
        'Salt, pepper, smoked paprika, fresh parsley',
      ],
      instructions: [
        'Cook chorizo in a skillet over medium heat until browned, 4–5 minutes. Remove excess fat.',
        'Add bell pepper and onion. Sauté 3 minutes until soft.',
        'Whisk eggs with salt and smoked paprika. Pour into the pan.',
        'Scramble gently over medium-low heat until just set.',
        'Garnish with fresh parsley.',
      ],
    },
  ];
}

function getLowCarbLunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Shrimp & Avocado Salad Bowl',
      ingredients: [
        `${Math.round(p * 0.85 / 0.24)}g cooked shrimp, peeled`,
        `${Math.round(f * 0.5 / 0.15)}g avocado, diced`,
        '3 cups mixed greens or romaine, chopped',
        '1/2 cup cherry tomatoes, halved',
        '1/4 cucumber, sliced',
        `${Math.round(f * 0.2 / 0.92)} tsp olive oil`,
        '1 tbsp lemon juice, salt, pepper, Old Bay or paprika',
      ],
      instructions: [
        'Season shrimp with paprika, salt, and pepper.',
        'Build salad with greens, tomatoes, and cucumber.',
        'Top with shrimp and avocado.',
        'Drizzle olive oil and lemon juice.',
        'Toss gently and serve immediately.',
      ],
    },
    {
      title: 'Turkey & Cheese Roll-Ups',
      ingredients: [
        `${Math.round(p * 0.6 / 0.35)}g sliced deli turkey breast`,
        `${Math.round(f * 0.35 / 0.33)}g sliced Swiss or provolone cheese`,
        `${Math.round(f * 0.3 / 0.15)}g avocado, sliced`,
        '1 cup baby spinach',
        '2 tbsp Dijon mustard',
        '1 cup celery sticks or cucumber slices',
        'Black pepper',
      ],
      instructions: [
        'Lay turkey slices flat. Place a slice of cheese on each.',
        'Add a few spinach leaves and avocado slice. Season with pepper.',
        'Spread mustard and roll tightly.',
        'Secure with a toothpick. Serve with celery sticks on the side.',
        'Great for meal prep — store in an airtight container up to 2 days.',
      ],
    },
    {
      title: 'Salmon & Cucumber Avocado Salad',
      ingredients: [
        `${Math.round(p * 0.8 / 0.25)}g canned or smoked salmon`,
        `${Math.round(f * 0.5 / 0.15)}g avocado, diced`,
        '1 cup cucumber, diced',
        '1/4 red onion, finely diced',
        '2 tbsp capers (optional)',
        '2 tbsp olive oil',
        '1 tbsp lemon juice, dill, salt, pepper',
      ],
      instructions: [
        'Flake salmon into a bowl.',
        'Add avocado, cucumber, red onion, and capers.',
        'Drizzle with olive oil and lemon juice. Season with dill, salt, and pepper.',
        'Toss gently to combine — don\'t mash the avocado.',
        'Serve over a bed of greens or eat as-is.',
      ],
    },
  ];
}

function getLowCarbDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Rack of Lamb with Roasted Broccoli',
      ingredients: [
        `${Math.round(p * 0.85 / 0.25)}g rack of lamb (frenched)`,
        '2 cups broccoli florets',
        `${Math.round(f * 0.35 / 0.81)}g butter`,
        '3 cloves garlic, fresh rosemary and thyme',
        '1 tsp Dijon mustard, salt, pepper, olive oil',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C.',
        'Rub lamb with mustard, garlic, rosemary, thyme, salt, and pepper.',
        'Sear lamb fat-side down in an oven-safe pan 3 minutes. Flip.',
        'Toss broccoli with olive oil and salt. Add to the pan around the lamb.',
        'Roast 20–25 minutes for medium rare (internal 130°F / 55°C). Rest 8 minutes.',
      ],
    },
    {
      title: 'Pork Belly Bites with Sautéed Kale',
      ingredients: [
        `${Math.round(p * 0.85 / 0.09)}g pork belly, cut into cubes`,
        '3 cups kale, stems removed, roughly chopped',
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        '3 cloves garlic',
        '1 tbsp apple cider vinegar',
        'Salt, pepper, chili flakes',
      ],
      instructions: [
        'Preheat oven to 375°F / 190°C.',
        'Season pork belly with salt, pepper, and chili flakes.',
        'Roast in a single layer 35–40 minutes until crispy and cooked through.',
        'Meanwhile, wilt kale in butter with garlic over medium heat, 5 minutes.',
        'Add vinegar to kale, season with salt. Serve alongside pork belly bites.',
      ],
    },
    {
      title: 'Shrimp Scampi with Zucchini Noodles',
      ingredients: [
        `${Math.round(p * 0.85 / 0.24)}g large shrimp, peeled and deveined`,
        '3 medium zucchini, spiralized',
        `${Math.round(f * 0.45 / 0.81)}g butter`,
        '4 cloves garlic, minced',
        '1/4 cup dry white wine or chicken broth',
        '1 tbsp lemon juice, fresh parsley',
        `${Math.round(p * 0.1 / 0.35)}g Parmesan, grated`,
        'Salt, red pepper flakes',
      ],
      instructions: [
        'Sauté zucchini noodles in a dry pan 2–3 minutes. Remove and set aside.',
        'Melt butter in the same pan over medium-high heat. Add garlic and red pepper flakes.',
        'Add shrimp. Cook 2 min per side until pink. Remove.',
        'Add wine and lemon juice. Simmer 2 minutes, scraping the pan.',
        'Return shrimp. Toss everything together. Serve over zucchini noodles with Parmesan.',
      ],
    },
  ];
}

function getLowCarbSnackSwapOptions(p, c, f) {
  return [
    {
      title: 'Prosciutto & Cream Cheese Cucumber Rolls',
      ingredients: [
        `${Math.round(p * 0.5 / 0.25)}g prosciutto, thin slices`,
        `${Math.round(f * 0.4 / 0.34)}g cream cheese (light)`,
        '1 large cucumber, cut into 3-inch spears',
        'Fresh dill or chives',
        'Black pepper',
      ],
      instructions: [
        'Spread a thin layer of cream cheese on each prosciutto slice.',
        'Lay a cucumber spear at one end. Sprinkle with dill and pepper.',
        'Roll the prosciutto tightly around the cucumber.',
        'Arrange on a plate. Serve cold.',
      ],
    },
    {
      title: 'Smoked Salmon on Cucumber Rounds',
      ingredients: [
        `${Math.round(p * 0.7 / 0.20)}g smoked salmon`,
        '1 large cucumber, sliced into rounds (1/2 inch thick)',
        `${Math.round(f * 0.45 / 0.34)}g cream cheese (light)`,
        '1 tbsp capers',
        'Fresh dill',
        'Lemon juice, black pepper',
      ],
      instructions: [
        'Pat cucumber rounds dry with a paper towel.',
        'Spread a small dollop of cream cheese on each round.',
        'Top with a piece of smoked salmon.',
        'Add a caper and a sprig of dill to each.',
        'Squeeze lemon juice over everything. Season with pepper.',
      ],
    },
    {
      title: 'Deviled Eggs',
      ingredients: [
        `${Math.max(3, Math.round(p * 0.8 / 6))} whole eggs, hard boiled`,
        '1 tbsp avocado oil mayonnaise',
        '1 tsp Dijon mustard',
        '1 tsp apple cider vinegar',
        `${Math.round(f * 0.3 / 0.33)}g crumbled bacon (optional)`,
        'Paprika, salt, pepper, chives',
      ],
      instructions: [
        'Hard boil eggs. Cool in ice water. Peel and slice in half lengthwise.',
        'Pop yolks into a bowl. Mash with mayo, mustard, vinegar, salt, and pepper.',
        'Fill each egg white half with the yolk mixture using a spoon or piping bag.',
        'Sprinkle paprika, bacon bits, and chives over the top.',
        'Refrigerate until ready to serve.',
      ],
    },
  ];
}

function getCarnivoreBreakfastSwapOptions(p, c, f) {
  return [
    {
      title: 'Pork Sausage & Scrambled Eggs',
      ingredients: [
        `${Math.round(p * 0.45 / 0.14)}g pork breakfast sausage (links or bulk)`,
        `${Math.max(3, Math.round(p * 0.55 / 6))} whole eggs`,
        `${Math.round(f * 0.25 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Cook sausage in a skillet over medium heat until browned and cooked through, 6–8 minutes.',
        'Set sausage aside. Wipe pan.',
        'Melt butter in the pan over low heat. Add whisked eggs.',
        'Stir gently until soft and creamy. Remove from heat while still slightly wet.',
        'Plate sausage alongside scrambled eggs. Season with salt.',
      ],
    },
    {
      title: 'Lamb Chops & Fried Eggs',
      ingredients: [
        `${Math.round(p * 0.65 / 0.25)}g lamb loin chops`,
        `${Math.max(2, Math.round(p * 0.35 / 6))} whole eggs`,
        `${Math.round(f * 0.35 / 0.81)}g butter`,
        'Salt, fresh rosemary (optional)',
      ],
      instructions: [
        'Season lamb chops generously with salt.',
        'Heat a cast iron pan until very hot. Sear lamb 3 minutes per side for medium. Rest 3 minutes.',
        'In the same pan, melt butter and fry eggs to your liking.',
        'Plate chops alongside eggs. Season with more salt if needed.',
      ],
    },
    {
      title: 'Turkey Sausage Patties & Eggs',
      ingredients: [
        `${Math.round(p * 0.5 / 0.29)}g ground turkey, seasoned and shaped into patties`,
        `${Math.max(3, Math.round(p * 0.5 / 6))} whole eggs`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        'Salt, garlic powder (optional)',
      ],
      instructions: [
        'Season turkey with salt and garlic powder. Form into 2–3 small patties.',
        'Cook in a skillet over medium heat 4–5 minutes per side until cooked through.',
        'In the same pan, melt butter and fry or scramble eggs.',
        'Plate turkey patties alongside eggs.',
      ],
    },
  ];
}

function getCarnivoreLunchSwapOptions(p, c, f) {
  return [
    {
      title: 'Slow-Cooked Pork Ribs',
      ingredients: [
        `${Math.round(p * 0.85 / 0.25)}g pork back ribs`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        'Salt, garlic powder (optional)',
      ],
      instructions: [
        'Preheat oven to 300°F / 150°C.',
        'Season ribs generously with salt on all sides.',
        'Wrap tightly in foil. Place on a baking sheet.',
        'Bake 2.5 hours until very tender and meat pulls from the bone.',
        'Unwrap. Baste with butter. Broil 3–5 minutes for a light crust.',
      ],
    },
    {
      title: 'Beef Liver & Crispy Bacon',
      ingredients: [
        `${Math.round(p * 0.65 / 0.27)}g beef liver, sliced`,
        `${Math.round(p * 0.25 / 0.35)}g bacon`,
        `${Math.round(f * 0.3 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Cook bacon in a skillet until crispy. Remove and set aside. Reserve fat.',
        'Season liver slices with salt.',
        'Add butter to the bacon fat. Pan-fry liver 2 minutes per side — do not overcook.',
        'Liver should be slightly pink in the center for best texture and nutrient retention.',
        'Plate liver with crispy bacon on the side.',
      ],
    },
    {
      title: 'Lamb Kofta Patties',
      ingredients: [
        `${Math.round(p * 0.9 / 0.25)}g ground lamb`,
        `${Math.round(f * 0.25 / 0.81)}g butter or tallow`,
        'Salt',
      ],
      instructions: [
        'Season ground lamb with salt only. Mix gently.',
        'Form into oval patties (kofta shape), about 80g each.',
        'Heat butter in a skillet over medium-high heat.',
        'Cook patties 4 minutes per side until browned and cooked through.',
        'Rest 2 minutes. Serve hot.',
      ],
    },
  ];
}

function getCarnivoreDinnerSwapOptions(p, c, f) {
  return [
    {
      title: 'Rack of Lamb with Herb Butter',
      ingredients: [
        `${Math.round(p * 0.9 / 0.25)}g rack of lamb`,
        `${Math.round(f * 0.5 / 0.81)}g butter, softened`,
        'Fresh rosemary and thyme, minced',
        '2 cloves garlic (optional)',
        'Salt',
      ],
      instructions: [
        'Bring rack of lamb to room temperature 20 minutes. Season generously with salt.',
        'Mix butter with rosemary, thyme, and garlic if using.',
        'Sear rack fat-side down in a hot skillet 3–4 minutes.',
        'Flip and slather with herb butter. Roast at 400°F / 200°C for 18–22 minutes (medium rare).',
        'Rest 8–10 minutes before carving. Pour pan juices over top.',
      ],
    },
    {
      title: 'Pork Chops with Pan Gravy',
      ingredients: [
        `${Math.round(p * 0.9 / 0.27)}g bone-in pork chops`,
        `${Math.round(f * 0.5 / 0.81)}g butter`,
        '2 cloves garlic (optional)',
        'Fresh sage or thyme (optional)',
        'Salt',
      ],
      instructions: [
        'Season pork chops very generously with salt.',
        'Heat a skillet over high heat. Add half the butter.',
        'Sear pork chops 4 minutes per side until deep golden brown.',
        'Add remaining butter and garlic. Baste chops continuously 2 minutes.',
        'Rest 5 minutes. Pour all the pan butter over chops before serving.',
      ],
    },
    {
      title: 'Duck Leg Confit',
      ingredients: [
        `${Math.round(p * 0.85 / 0.19)}g duck legs`,
        `${Math.round(f * 0.5 / 0.81)}g duck fat or butter`,
        'Salt',
      ],
      instructions: [
        'Season duck legs heavily with salt. Refrigerate uncovered 4–24 hours (optional but improves flavor).',
        'Preheat oven to 300°F / 150°C.',
        'Place duck legs in a small baking dish. Cover with melted duck fat or butter.',
        'Bake covered 2.5 hours until very tender.',
        'Uncover and raise oven to 425°F / 220°C. Roast 15–20 minutes until skin is crispy.',
      ],
    },
  ];
}

function getCarnivoreSnackSwapOptions(p, c, f) {
  return [
    {
      title: 'Smoked Salmon & Cream Cheese',
      ingredients: [
        `${Math.round(p * 0.7 / 0.20)}g smoked salmon`,
        `${Math.round(f * 0.5 / 0.34)}g cream cheese`,
        'Lemon juice, dill (optional)',
      ],
      instructions: [
        'Lay smoked salmon slices flat.',
        'Spread cream cheese on each slice.',
        'Roll up or eat as-is.',
        'Squeeze lemon juice over the top if using.',
      ],
    },
    {
      title: 'Chicken Drumsticks',
      ingredients: [
        `${Math.round(p * 0.9 / 0.18)}g chicken drumsticks`,
        `${Math.round(f * 0.2 / 0.81)}g butter`,
        'Salt',
      ],
      instructions: [
        'Preheat oven to 425°F / 220°C.',
        'Rub drumsticks with melted butter and season generously with salt.',
        'Bake 30–35 minutes until skin is crispy and internal temp is 165°F / 74°C.',
        'Cool slightly and eat with your hands.',
        'Great for meal prep — make a batch and refrigerate.',
      ],
    },
    {
      title: 'Pork Rinds & Bone Broth',
      ingredients: [
        `${Math.round(p * 0.6 / 0.55)}g plain pork rinds (chicharrones)`,
        `${Math.round(p * 0.3 / 0.07)}g beef bone broth (warm cup)`,
        'Salt',
      ],
      instructions: [
        'Warm bone broth in a small saucepan or microwave until steaming.',
        'Pour into a mug.',
        'Serve pork rinds on the side — great for dipping or eating separately.',
        'Season broth with a pinch of salt if needed.',
      ],
    },
  ];
}

// --- Swap Infrastructure ---

function getSwapPool(mealIndex, totalMeals, protein, carbs, fats, profile) {
  const isBreakfast = mealIndex === 0;
  const isDinner = mealIndex === totalMeals - 1;
  const isLunch = (totalMeals <= 4 && mealIndex === 1) || (totalMeals >= 5 && mealIndex === 2);
  const is2Meal = totalMeals === 2;
  const d = (profile && profile.diet) ? profile.diet : {};

  let options;
  if (d.isCarnivore) {
    if (is2Meal) options = mealIndex === 0 ? getCarnivoreLunchSwapOptions(protein, carbs, fats) : getCarnivoreDinnerSwapOptions(protein, carbs, fats);
    else if (isBreakfast) options = getCarnivoreBreakfastSwapOptions(protein, carbs, fats);
    else if (isDinner) options = getCarnivoreDinnerSwapOptions(protein, carbs, fats);
    else if (isLunch) options = getCarnivoreLunchSwapOptions(protein, carbs, fats);
    else options = getCarnivoreSnackSwapOptions(protein, carbs, fats);
  } else if (d.isVegan) {
    if (is2Meal) options = mealIndex === 0 ? getVeganLunchSwapOptions(protein, carbs, fats) : getVeganDinnerSwapOptions(protein, carbs, fats);
    else if (isBreakfast) options = getVeganBreakfastSwapOptions(protein, carbs, fats);
    else if (isDinner) options = getVeganDinnerSwapOptions(protein, carbs, fats);
    else if (isLunch) options = getVeganLunchSwapOptions(protein, carbs, fats);
    else options = getVeganSnackSwapOptions(protein, carbs, fats);
  } else if (d.isVegetarian) {
    if (is2Meal) options = mealIndex === 0 ? getVegetarianLunchSwapOptions(protein, carbs, fats) : getVegetarianDinnerSwapOptions(protein, carbs, fats);
    else if (isBreakfast) options = getVegetarianBreakfastSwapOptions(protein, carbs, fats);
    else if (isDinner) options = getVegetarianDinnerSwapOptions(protein, carbs, fats);
    else if (isLunch) options = getVegetarianLunchSwapOptions(protein, carbs, fats);
    else options = getVegetarianSnackSwapOptions(protein, carbs, fats);
  } else if (d.isLowCarb || d.isKeto) {
    if (is2Meal) options = mealIndex === 0 ? getLowCarbLunchSwapOptions(protein, carbs, fats) : getLowCarbDinnerSwapOptions(protein, carbs, fats);
    else if (isBreakfast) options = getLowCarbBreakfastSwapOptions(protein, carbs, fats);
    else if (isDinner) options = getLowCarbDinnerSwapOptions(protein, carbs, fats);
    else if (isLunch) options = getLowCarbLunchSwapOptions(protein, carbs, fats);
    else options = getLowCarbSnackSwapOptions(protein, carbs, fats);
  } else {
    if (is2Meal) options = mealIndex === 0 ? getBrunchSwapOptions(protein, carbs, fats) : getLargeDinnerSwapOptions(protein, carbs, fats);
    else if (isBreakfast) options = getBreakfastSwapOptions(protein, carbs, fats);
    else if (isDinner) options = getDinnerSwapOptions(protein, carbs, fats);
    else if (isLunch) options = getLunchSwapOptions(protein, carbs, fats);
    else options = getSnackSwapOptions(protein, carbs, fats);
  }

  return filterMealOptions(options, profile);
}

function getFullOptionPool(mealIndex, totalMeals, protein, carbs, fats, profile) {
  const original = getMealOptions(mealIndex, totalMeals, protein, carbs, fats, null, profile);
  const extras = getSwapPool(mealIndex, totalMeals, protein, carbs, fats, profile);
  const seen = new Set(original.map(o => o.title));
  return [...original, ...extras.filter(o => !seen.has(o.title))];
}

// --- Food List with Quantities ---

function getFoodList(data) {
  const pServing = Math.round(data.proteinGrams / data.mealsPerDay);
  const cServing = Math.round(data.carbsGrams / data.mealsPerDay);
  const fServing = Math.round(data.fatGrams / data.mealsPerDay);
  const profile = clientProfile || buildDefaultProfile();
  const d = profile.diet;

  let proteins, carbs, fats;

  if (d.isCarnivore) {
    proteins = [
      { name: 'Beef (various cuts)', grams: Math.round(pServing / 0.26) },
      { name: 'Ground beef (90% lean)', grams: Math.round(pServing / 0.26) },
      { name: 'Chicken thighs (bone-in)', grams: Math.round(pServing / 0.25) },
      { name: 'Salmon fillet', grams: Math.round(pServing / 0.25) },
      { name: 'Eggs (whole)', grams: Math.round(pServing / 0.12) },
      { name: 'Bacon', grams: Math.round(pServing / 0.35) },
    ];
    carbs = [];
    fats = [
      { name: 'Butter', grams: Math.round(fServing / 0.81) },
      { name: 'Beef tallow', grams: Math.round(fServing / 0.98) },
      { name: 'Cheddar cheese', grams: Math.round(fServing / 0.33) },
    ];
  } else if (d.isVegan) {
    proteins = [
      { name: 'Firm tofu', grams: Math.round(pServing / 0.08) },
      { name: 'Tempeh', grams: Math.round(pServing / 0.19) },
      { name: 'Cooked lentils', grams: Math.round(pServing / 0.09) },
      { name: 'Canned chickpeas', grams: Math.round(pServing / 0.09) },
      { name: 'Black beans (cooked)', grams: Math.round(pServing / 0.089) },
      { name: 'Edamame (shelled)', grams: Math.round(pServing / 0.11) },
      { name: 'Plant protein powder', grams: Math.round(pServing / 0.75) },
    ];
    carbs = [
      { name: 'Brown rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Quinoa (cooked)', grams: Math.round(cServing / 0.21) },
      { name: 'Sweet potato (baked)', grams: Math.round(cServing / 0.20) },
      { name: 'Rolled oats (dry)', grams: Math.round(cServing / 0.60) },
      { name: 'Whole grain bread', grams: Math.round(cServing / 0.43) },
    ];
    fats = [
      { name: 'Avocado', grams: Math.round(fServing / 0.15) },
      { name: 'Olive oil', grams: Math.round(fServing / 0.92) },
      { name: 'Almond butter', grams: Math.round(fServing / 0.50) },
      { name: 'Hemp seeds', grams: Math.round(fServing / 0.31) },
      { name: 'Walnuts', grams: Math.round(fServing / 0.65) },
      { name: 'Chia seeds', grams: Math.round(fServing / 0.31) },
    ];
  } else if (d.isVegetarian) {
    proteins = [
      { name: 'Eggs (whole)', grams: Math.round(pServing / 0.12) },
      { name: 'Nonfat Greek yogurt', grams: Math.round(pServing / 0.10) },
      { name: 'Low-fat cottage cheese', grams: Math.round(pServing / 0.11) },
      { name: 'Cooked lentils', grams: Math.round(pServing / 0.09) },
      { name: 'Chickpeas (cooked)', grams: Math.round(pServing / 0.09) },
      { name: 'Mozzarella (low-fat)', grams: Math.round(pServing / 0.22) },
      { name: 'Protein powder (whey/plant)', grams: Math.round(pServing / 0.75) },
    ];
    carbs = [
      { name: 'Brown rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Quinoa (cooked)', grams: Math.round(cServing / 0.21) },
      { name: 'Sweet potato (baked)', grams: Math.round(cServing / 0.20) },
      { name: 'Rolled oats (dry)', grams: Math.round(cServing / 0.60) },
      { name: 'Whole grain bread', grams: Math.round(cServing / 0.43) },
      { name: 'Whole wheat pasta (cooked)', grams: Math.round(cServing / 0.25) },
    ];
    fats = [
      { name: 'Avocado', grams: Math.round(fServing / 0.15) },
      { name: 'Olive oil', grams: Math.round(fServing / 0.92) },
      { name: 'Walnuts', grams: Math.round(fServing / 0.65) },
      { name: 'Almonds', grams: Math.round(fServing / 0.50) },
      { name: 'Chia seeds', grams: Math.round(fServing / 0.31) },
    ];
  } else if (d.isLowCarb || d.isKeto) {
    proteins = [
      { name: 'Chicken breast', grams: Math.round(pServing / 0.31) },
      { name: 'Salmon fillet', grams: Math.round(pServing / 0.25) },
      { name: 'Lean beef (sirloin)', grams: Math.round(pServing / 0.26) },
      { name: 'Ground beef (90% lean)', grams: Math.round(pServing / 0.26) },
      { name: 'Eggs (whole)', grams: Math.round(pServing / 0.12) },
      { name: 'Bacon', grams: Math.round(pServing / 0.35) },
      { name: 'Canned tuna (in water)', grams: Math.round(pServing / 0.26) },
    ];
    carbs = [
      { name: 'Leafy greens (spinach/kale)', grams: Math.round(cServing / 0.03) },
      { name: 'Zucchini / Cauliflower', grams: Math.round(cServing / 0.05) },
      { name: 'Bell peppers', grams: Math.round(cServing / 0.06) },
      { name: 'Broccoli', grams: Math.round(cServing / 0.07) },
    ];
    fats = [
      { name: 'Avocado', grams: Math.round(fServing / 0.15) },
      { name: 'Olive oil', grams: Math.round(fServing / 0.92) },
      { name: 'Butter', grams: Math.round(fServing / 0.81) },
      { name: 'Cheddar cheese', grams: Math.round(fServing / 0.33) },
      { name: 'Almonds', grams: Math.round(fServing / 0.50) },
      { name: 'Walnuts', grams: Math.round(fServing / 0.65) },
    ];
  } else {
    proteins = [
      { name: 'Chicken breast', grams: Math.round(pServing / 0.31) },
      { name: 'Ground turkey (93% lean)', grams: Math.round(pServing / 0.29) },
      { name: 'Salmon fillet', grams: Math.round(pServing / 0.25) },
      { name: 'Tilapia', grams: Math.round(pServing / 0.26) },
      { name: 'Lean beef (sirloin)', grams: Math.round(pServing / 0.26) },
      { name: 'Egg whites', grams: Math.round(pServing / 0.11) },
      { name: 'Nonfat Greek yogurt', grams: Math.round(pServing / 0.10) },
      { name: 'Low-fat cottage cheese', grams: Math.round(pServing / 0.11) },
    ];
    carbs = [
      { name: 'Brown rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Quinoa (cooked)', grams: Math.round(cServing / 0.21) },
      { name: 'Sweet potato (baked)', grams: Math.round(cServing / 0.20) },
      { name: 'Rolled oats (dry)', grams: Math.round(cServing / 0.60) },
      { name: 'Whole grain bread', grams: Math.round(cServing / 0.43) },
      { name: 'Jasmine rice (cooked)', grams: Math.round(cServing / 0.28) },
      { name: 'Whole wheat pasta (cooked)', grams: Math.round(cServing / 0.25) },
    ];
    fats = [
      { name: 'Avocado', grams: Math.round(fServing / 0.15) },
      { name: 'Olive oil', grams: Math.round(fServing / 0.92) },
      { name: 'Almonds', grams: Math.round(fServing / 0.50) },
      { name: 'Walnuts', grams: Math.round(fServing / 0.65) },
      { name: 'Natural peanut butter', grams: Math.round(fServing / 0.50) },
      { name: 'Chia seeds', grams: Math.round(fServing / 0.31) },
    ];
  }

  // Remove items containing allergens or disliked foods
  const restrictTerms = [...profile.allergenList, ...profile.dislikeList].flatMap(expandRestriction);
  if (restrictTerms.length) {
    const clean = items => items.filter(item =>
      !restrictTerms.some(r => r && item.name.toLowerCase().includes(r))
    );
    proteins = clean(proteins);
    carbs    = clean(carbs);
    fats     = clean(fats);
  }

  return { proteins, carbs, fats };
}

// --- Weekly Grocery Shopping List ---

function getWeeklyGroceryList(data) {
  const w = 7;
  const pDaily = data.proteinGrams;
  const cDaily = data.carbsGrams;
  const fDaily = data.fatGrams;
  const profile = clientProfile || buildDefaultProfile();
  const d = profile.diet;

  let result;

  if (d.isCarnivore) {
    result = {
      'Proteins & Meats': [
        `Beef (assorted cuts) — ${Math.round(pDaily * 0.40 / 0.26 * w)}g`,
        `Ground beef (90% lean) — ${Math.round(pDaily * 0.25 / 0.26 * w)}g`,
        `Chicken thighs — ${Math.round(pDaily * 0.20 / 0.25 * w)}g`,
        `Salmon fillets — ${Math.round(pDaily * 0.10 / 0.25 * w)}g`,
        `Eggs — ${Math.max(14, Math.round(pDaily * 0.05 / 6 * w))} units`,
        'Bacon — 500g',
      ],
      'Dairy & Animal Fats': [
        `Butter — ${Math.round(fDaily * 0.30 / 0.81 * w)}g`,
        'Cheddar cheese — 400g',
        'Heavy cream — 200ml',
      ],
      'Pantry & Seasonings': [
        'Sea salt',
        'Black pepper',
        'Garlic powder',
        'Bone broth — 2 cartons',
      ],
    };
  } else if (d.isVegan) {
    result = {
      'Plant Proteins': [
        `Firm tofu — ${Math.round(pDaily * 0.30 / 0.08 * w)}g`,
        `Tempeh — ${Math.round(pDaily * 0.25 / 0.19 * w)}g`,
        `Cooked lentils — ${Math.round(pDaily * 0.20 / 0.09 * w)}g`,
        `Chickpeas (canned) — ${Math.round(pDaily * 0.15 / 0.09 * w)}g`,
        `Edamame (frozen, shelled) — ${Math.round(pDaily * 0.10 / 0.11 * w)}g`,
        'Plant protein powder — 1 container',
      ],
      'Carbs & Grains': [
        `Brown rice (dry) — ${Math.round(cDaily * 0.25 / 0.77 * w)}g`,
        `Quinoa (dry) — ${Math.round(cDaily * 0.20 / 0.64 * w)}g`,
        `Rolled oats — ${Math.round(cDaily * 0.15 / 0.60 * w)}g`,
        `Sweet potatoes — ${Math.round(cDaily * 0.20 / 0.20 * w)}g`,
        'Whole grain bread — 1 loaf',
      ],
      'Healthy Fats': [
        `Avocados — ${Math.max(3, Math.round(fDaily * 0.25 / 15 * w))} units`,
        `Extra virgin olive oil — ${Math.round(fDaily * 0.20 / 0.92 * w)}ml`,
        `Almond butter — ${Math.round(fDaily * 0.20 / 0.50 * w)}g`,
        'Hemp seeds — 200g',
        'Chia seeds — 200g',
        `Walnuts — ${Math.round(fDaily * 0.15 / 0.65 * w)}g`,
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
        'Bell peppers (mixed) — 6 units',
        'Zucchini — 4 units',
        'Mushrooms — 400g',
        'Tomatoes — 500g',
        'Onions — 4 units',
        'Garlic — 2 heads',
        'Kale — 300g',
      ],
      'Pantry & Seasonings': [
        'Low-sodium soy sauce / tamari',
        'Nutritional yeast',
        'Cinnamon',
        'Italian seasoning',
        'Garlic powder',
        'Salt & pepper',
        'Coconut aminos',
      ],
    };
  } else if (d.isVegetarian) {
    result = {
      'Proteins': [
        `Eggs — ${Math.max(14, Math.round(pDaily * 0.25 / 6 * w))} units`,
        `Nonfat Greek yogurt — ${Math.round(pDaily * 0.20 / 0.10 * w)}g`,
        `Low-fat cottage cheese — ${Math.round(pDaily * 0.15 / 0.11 * w)}g`,
        `Cooked lentils — ${Math.round(pDaily * 0.15 / 0.09 * w)}g`,
        `Chickpeas (canned) — ${Math.round(pDaily * 0.10 / 0.09 * w)}g`,
        'Mozzarella (low-fat) — 300g',
        'Whey or plant protein powder — 1 container',
      ],
      'Carbs & Grains': [
        `Brown rice (dry) — ${Math.round(cDaily * 0.25 / 0.77 * w)}g`,
        `Quinoa (dry) — ${Math.round(cDaily * 0.15 / 0.64 * w)}g`,
        `Rolled oats — ${Math.round(cDaily * 0.15 / 0.60 * w)}g`,
        `Sweet potatoes — ${Math.round(cDaily * 0.20 / 0.20 * w)}g`,
        'Whole grain bread — 1 loaf',
        `Whole wheat pasta (dry) — ${Math.round(cDaily * 0.10 / 0.70 * w)}g`,
      ],
      'Healthy Fats': [
        `Avocados — ${Math.max(3, Math.round(fDaily * 0.20 / 15 * w))} units`,
        `Extra virgin olive oil — ${Math.round(fDaily * 0.20 / 0.92 * w)}ml`,
        `Almonds — ${Math.round(fDaily * 0.15 / 0.50 * w)}g`,
        `Walnuts — ${Math.round(fDaily * 0.15 / 0.65 * w)}g`,
        'Chia seeds — 200g',
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
        'Bell peppers (mixed) — 6 units',
        'Zucchini — 4 units',
        'Mushrooms — 400g',
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
  } else if (d.isLowCarb || d.isKeto) {
    result = {
      'Proteins & Meats': [
        `Chicken breast — ${Math.round(pDaily * 0.30 / 0.31 * w)}g`,
        `Salmon fillets — ${Math.round(pDaily * 0.20 / 0.25 * w)}g`,
        `Lean beef (sirloin) — ${Math.round(pDaily * 0.20 / 0.26 * w)}g`,
        `Eggs — ${Math.max(14, Math.round(pDaily * 0.15 / 6 * w))} units`,
        `Bacon — ${Math.round(pDaily * 0.10 / 0.35 * w)}g`,
        `Canned tuna (in water) — ${Math.round(pDaily * 0.05 / 0.26 * w)}g`,
      ],
      'Healthy Fats': [
        `Avocados — ${Math.max(5, Math.round(fDaily * 0.25 / 15 * w))} units`,
        `Extra virgin olive oil — ${Math.round(fDaily * 0.20 / 0.92 * w)}ml`,
        `Butter — ${Math.round(fDaily * 0.15 / 0.81 * w)}g`,
        'Cheddar cheese — 400g',
        `Almonds — ${Math.round(fDaily * 0.15 / 0.50 * w)}g`,
        `Walnuts — ${Math.round(fDaily * 0.10 / 0.65 * w)}g`,
      ],
      'Low-Carb Vegetables': [
        'Spinach / Kale — 600g',
        'Broccoli — 800g',
        'Zucchini — 6 units',
        'Cauliflower — 1 head',
        'Bell peppers — 6 units',
        'Mushrooms — 400g',
        'Asparagus — 500g',
        'Onions — 3 units',
        'Garlic — 2 heads',
      ],
      'Dairy': [
        'Heavy cream — 200ml',
        'Nonfat Greek yogurt (plain) — 500g',
      ],
      'Pantry & Seasonings': [
        'Sea salt',
        'Black pepper',
        'Garlic powder',
        'Italian seasoning',
        'Low-sodium soy sauce',
        'Coconut oil — 1 jar',
        'Cooking spray',
      ],
    };
  } else {
    result = {
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
        `Whole grain bread — 1 loaf`,
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

  // Filter allergens and dislikes from grocery items
  const restrictTerms = [...profile.allergenList, ...profile.dislikeList].flatMap(expandRestriction);
  if (restrictTerms.length) {
    Object.keys(result).forEach(cat => {
      result[cat] = result[cat].filter(item =>
        !restrictTerms.some(r => r && item.toLowerCase().includes(r))
      );
    });
  }

  return result;
}

// --- Meal Timing ---

function parseTimeToHour(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  if (t.includes('noon') || t.includes('midday')) return 12;
  if (t.includes('midnight')) return 0;
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const period = m[3] ? m[3].toLowerCase() : null;
  if (period === 'pm' && h < 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  // Heuristic for ambiguous times (no AM/PM): hours 1-6 are PM
  if (!period && h >= 1 && h <= 6) h += 12;
  return h + min / 60;
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  let hour = Math.floor(h) % 12;
  if (hour === 0) hour = 12;
  const min = Math.round((h % 1) * 60);
  return `${hour}:${min.toString().padStart(2, '0')} ${period}`;
}

function getMealTiming(mealsPerDay, client) {
  const profile = clientProfile || buildDefaultProfile();
  const firstMealRaw = profile.firstMealTime || getClientField(client, 'first meal', 'q7', 'eating window');
  const trainingRaw  = profile.trainingTime  || getClientField(client, 'time of day', 'q17', 'train');

  const firstHour   = parseTimeToHour(firstMealRaw);
  const trainHour   = parseTimeToHour(trainingRaw);

  // Default start hour if none parsed
  const startHour = firstHour !== null ? firstHour : 7;
  // Eating window: spread meals across roughly 12 hours (or 8 for IF)
  const windowHours = firstHour !== null ? Math.min(12, 22 - startHour) : 12;
  const gapHours = mealsPerDay > 1 ? windowHours / (mealsPerDay - 1) : 0;

  const mealNames = ['Breakfast', 'Snack 1', 'Lunch', 'Snack 2', 'Dinner', 'Evening Snack'];
  const mealNamesAlt2 = ['Meal 1', 'Meal 2'];

  const timings = [];
  for (let i = 0; i < mealsPerDay; i++) {
    const h = startHour + i * gapHours;
    let name;
    if (mealsPerDay === 2) {
      name = mealNamesAlt2[i] || `Meal ${i + 1}`;
    } else {
      name = mealNames[i] || `Meal ${i + 1}`;
    }
    let note = '';
    if (trainHour !== null) {
      const diff = trainHour - h;
      if (diff > 0 && diff <= 1.5) note = 'Pre-workout meal — eat 60–90 min before training';
      else if (diff < 0 && diff >= -1)  note = 'Post-workout meal — eat within 60 min after training';
    }
    if (!note) {
      if (i === 0) note = firstHour !== null ? 'First meal of the day — sets the tone for your nutrition' : 'Within 1 hour of waking up';
      else if (i === mealsPerDay - 1) note = 'Last meal — at least 2–3 hours before bed';
      else note = 'Space meals evenly to maintain energy and prevent hunger';
    }
    timings.push({ meal: name, time: formatHour(h), note });
  }

  let routineNote = '';
  if (firstMealRaw) routineNote += `First meal at ${firstMealRaw}. `;
  if (trainingRaw)  routineNote += `Training at ${trainingRaw}. `;
  if (routineNote)  routineNote = `Meal times are calculated from your routine: ${routineNote}Adjust as needed to fit your day.`;

  return { timings, routineNote };
}

// --- Workout Nutrition ---

function getWorkoutNutrition(goal, client) {
  const profile = clientProfile || buildDefaultProfile();
  const d = profile.diet;
  const training     = profile.trainingType     || getClientField(client, 'type of training', 'q16', 'training');
  const trainingTime = profile.trainingTime     || getClientField(client, 'time of day', 'q17', 'train');

  const pre = { timing: '60–90 minutes before training', foods: [], notes: '' };
  const post = { timing: 'Within 30–45 minutes after training', foods: [], notes: '' };

  if (d.isCarnivore) {
    pre.foods = [
      'Small portion of beef or chicken (80–100g)',
      'OR 2–3 hard-boiled eggs',
      'OR a slice of steak — no carbs needed on carnivore',
    ];
    pre.notes = 'On carnivore your body runs on fat and protein — no carb loading required.';
    post.foods = [
      'Steak or ground beef (150–200g)',
      'OR 3–4 scrambled eggs with butter',
      'OR beef liver (excellent micronutrient profile for recovery)',
    ];
    post.notes = 'Prioritize animal protein to repair muscle. Fat is your recovery fuel.';
  } else if (d.isVegan) {
    if (goal === 'fat-loss') {
      pre.foods = ['1 banana + 1 tbsp almond butter', 'OR 1/2 cup oats with berries', 'OR plant protein shake with water'];
      pre.notes = 'Keep it light — fuel the session without overshooting calories.';
      post.foods = ['Plant protein shake (20–25g protein) + 1 banana', 'OR tofu scramble with brown rice', 'OR edamame + quinoa bowl'];
      post.notes = 'Prioritize plant protein immediately after training to preserve muscle.';
    } else if (goal === 'muscle-gain') {
      pre.foods = ['1 cup oats with banana and maple syrup', 'OR 2 slices whole grain toast with almond butter and banana', 'OR a smoothie: plant protein + banana + oats + almond milk'];
      pre.notes = 'Carbs are critical for performance — do not skip this meal.';
      post.foods = ['Plant protein shake (25–30g protein) + 1 banana', 'OR tempeh + rice bowl', 'OR lentil + sweet potato bowl with tahini'];
      post.notes = 'Maximize the anabolic window with protein + fast carbs. This is your growth fuel.';
    } else {
      pre.foods = ['1/2 cup oats with fruit', 'OR a banana with almond butter', 'OR plant protein bar'];
      pre.notes = 'Enough to fuel your session without feeling heavy.';
      post.foods = ['Plant protein shake + fruit', 'OR tofu stir-fry with rice', 'OR your next balanced meal if within 1 hour'];
      post.notes = 'Focus on protein + complex carbs for balanced recovery.';
    }
  } else if (d.isLowCarb || d.isKeto) {
    pre.foods = [
      '2 hard-boiled eggs with avocado',
      'OR a small portion of chicken with olive oil',
      'OR a handful of nuts + 1 boiled egg',
    ];
    pre.notes = 'Keep carbs out of your pre-workout. Your body is fat-adapted — it will use fat for fuel.';
    post.foods = [
      'Chicken or beef (150–200g) with leafy greens',
      'OR salmon fillet with sautéed zucchini',
      'OR 3–4 eggs with cheese and vegetables',
    ];
    post.notes = 'Focus on protein for repair. Keep carbs very low to stay in ketosis/fat-burning mode.';
  } else if (d.isVegetarian) {
    if (goal === 'fat-loss') {
      pre.foods = ['1 banana + 1 tbsp peanut butter', 'OR Greek yogurt with berries', 'OR 1 slice whole grain toast with 1 egg'];
      pre.notes = 'Light fuel before training — keep it under 200 calories.';
      post.foods = ['Greek yogurt + 1 banana', 'OR 2 eggs with oats', 'OR cottage cheese + fruit bowl'];
      post.notes = 'Protein + carbs post-workout to preserve muscle while in a calorie deficit.';
    } else if (goal === 'muscle-gain') {
      pre.foods = ['1 cup oats + banana + honey', 'OR 2 eggs on whole grain toast', 'OR protein smoothie with banana and Greek yogurt'];
      pre.notes = 'Carbs fuel your lifts — do not train fasted when building muscle.';
      post.foods = ['Protein shake (whey or plant) + banana', 'OR 3–4 eggs with brown rice', 'OR cottage cheese + sweet potato'];
      post.notes = 'Hit your protein target immediately after training for maximum muscle protein synthesis.';
    } else {
      pre.foods = ['1/2 cup oats + fruit', 'OR Greek yogurt', 'OR banana with almonds'];
      pre.notes = 'Moderate fuel — enough for the session without excess calories.';
      post.foods = ['Protein shake + fruit', 'OR balanced meal within 1 hour'];
      post.notes = 'Prioritize protein to support recovery and maintain lean mass.';
    }
  } else {
    // Omnivore defaults
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
  }

  let trainingInfo = '';
  if (training)     trainingInfo += `Training type: ${training}. `;
  if (trainingTime) trainingInfo += `Usual training time: ${trainingTime}.`;

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
    return `Following your plan consistently, you can expect to lose approximately 1–1.5 lbs per week. In 4 weeks, that is 4–6 lbs of fat loss while preserving muscle mass. Results depend on your consistency, training intensity, sleep, and stress management. Reassess and adjust your plan every 2–4 weeks based on your progress.`;
  } else if (goal === 'muscle-gain') {
    return `With consistent training and nutrition, you can expect to gain approximately 0.5–1 lb of lean muscle per week. In 8 weeks, that is 4–8 lbs of quality muscle gain. Track your lifts and body measurements to monitor your progress. Reassess your calorie needs every 3–4 weeks as your weight increases.`;
  } else if (goal === 'body-recomposition') {
    return `Body recomposition is the process of simultaneously losing fat and building muscle. With a small 200-calorie deficit and high protein intake, expect subtle but meaningful changes over 8–12 weeks — less body fat and more muscle definition. The scale may barely move, but your body composition will shift. Track your measurements and progress photos monthly rather than relying on the scale. Reassess your macros every 4 weeks.`;
  }
  return `Following this maintenance plan, your weight should remain stable within 1–2 lbs. Focus on body composition changes rather than the scale. If you notice unintended weight gain or loss, adjust your portions and macros accordingly. Check-ins every 2–4 weeks are recommended.`;
}

// --- Tips ---

function generateTips(goal, client) {
  const profile = clientProfile || buildDefaultProfile();
  const score = profile.consistencyScore || 5;

  const tips = [];

  if (score <= 4) {
    // Low consistency: simple, habit-building, no overwhelm
    tips.push('Start with one change at a time — master it before adding another.');
    tips.push('Meal prep just 2 meals in advance to build the habit without stress.');
    tips.push('Drink a glass of water before every meal — it is the easiest win.');
    if (goal === 'fat-loss') {
      tips.push('Focus on protein first at each meal — this alone will reduce cravings.');
      tips.push('Swap one processed snack per day for fruit, yogurt, or nuts.');
    } else if (goal === 'muscle-gain') {
      tips.push('Hit your protein target — that is your only job this week.');
      tips.push('Do not skip breakfast. It sets your intake rhythm for the day.');
    } else {
      tips.push('Keep your meal schedule consistent — same time each day helps your body regulate appetite.');
    }
    tips.push('Progress over perfection — an 80% week is better than giving up after a bad day.');
  } else if (score <= 7) {
    // Medium consistency: standard tips
    tips.push('Meal prep your proteins and grains on Sundays to stay on track all week.');
    tips.push('Track your food for at least the first 2 weeks to build portion awareness.');
    tips.push('Eat slowly and mindfully — it takes 20 minutes for satiety signals to kick in.');
    if (goal === 'fat-loss') {
      tips.push('Prioritize protein at every meal to preserve muscle while losing fat.');
      tips.push('Limit liquid calories — sodas, juices, and alcohol are easy places to cut.');
      tips.push('Add fiber-rich vegetables to each meal to stay full longer.');
      tips.push('Avoid eating 2–3 hours before bedtime.');
    } else if (goal === 'muscle-gain') {
      tips.push('Eat within 1–2 hours of training for optimal recovery.');
      tips.push('Spread protein intake evenly across all meals — aim for 30–40g per meal.');
      tips.push('Include calorie-dense whole foods: nuts, avocado, olive oil, nut butters.');
      tips.push('Prioritize 7–9 hours of sleep — muscle is built during recovery, not the gym.');
    } else {
      tips.push('Focus on whole, minimally processed foods as your baseline.');
      tips.push('Monitor your energy and hunger levels — adjust portions as needed.');
      tips.push('Keep a balanced ratio of protein, carbs, and fats across the day.');
    }
  } else {
    // High consistency: advanced macro-tracking, optimization tips
    tips.push('Use a food scale to hit your macros within 5% daily — precision compounds over time.');
    tips.push('Track your macros for every meal in an app (MyFitnessPal, Cronometer) until it becomes automatic.');
    tips.push('Time your carbs around training for performance and recovery optimization.');
    if (goal === 'fat-loss') {
      tips.push('Implement a refeed day (higher carbs, maintenance calories) every 7–10 days to support hormones and metabolism.');
      tips.push('Use calorie cycling: slightly higher on training days, lower on rest days.');
      tips.push('Monitor weekly average weight (not daily) to track true fat loss trends.');
      tips.push('Minimize sodium and processed foods on low-carb days to reduce water retention noise.');
    } else if (goal === 'muscle-gain') {
      tips.push('Consider reverse dieting — gradually increase calories by 50–100kcal/week to minimize fat gain.');
      tips.push('Track progressive overload alongside your nutrition to ensure muscle stimulus matches intake.');
      tips.push('Supplement strategically: creatine (5g/day), caffeine pre-workout, and leucine-rich protein sources post-workout.');
      tips.push('Deload weeks (lower intensity) every 4–6 weeks help with recovery and prevent overtraining.');
    } else {
      tips.push('Run a body composition check every 4 weeks (measurements + weight) to detect silent shifts.');
      tips.push('Consider periodic mini-cuts (2–3 weeks) or mini-bulks based on how your body responds.');
      tips.push('Optimize meal timing to your training schedule — pre/post workout windows matter at this level.');
    }
    tips.push('Sleep and stress management are the final 20% — do not ignore them.');
  }

  return tips;
}

// --- Medical Adjustments ---

function getMedicalAdjustments(profile) {
  if (!profile || !profile.medicalConditions) return [];
  const mc = profile.medicalConditions.toLowerCase();
  const notes = [];

  if (mc.includes('pcos') || mc.includes('polycystic')) {
    notes.push('PCOS: Your carbohydrate intake has been reduced by ~20% to help regulate insulin and hormone levels. Prioritize low-glycemic carbs (oats, sweet potato, legumes) and avoid refined sugars and white flour. Consistent meal timing also helps hormone regulation.');
  }
  if (mc.includes('insulin resistance')) {
    notes.push('Insulin Resistance: Carbohydrates have been reduced and shifted toward fiber-rich, low-glycemic sources. Avoid eating large carb portions alone — always pair with protein or fat to blunt the blood sugar response. Fasting windows (e.g., no eating after 8 PM) may help improve insulin sensitivity.');
  }
  if (mc.includes('type 2 diabetes') || mc.includes('type2 diabetes') || mc.includes('t2d')) {
    notes.push('Type 2 Diabetes: This plan uses lower-glycemic carbohydrates and distributes them evenly across meals to prevent blood sugar spikes. Monitor your glucose levels when making dietary changes. Consult your physician before altering any prescribed dietary guidelines.');
  }
  if (mc.includes('hypothyroid') || mc.includes('underactive thyroid')) {
    notes.push('Hypothyroidism: A slightly higher protein intake supports a sluggish metabolism. Avoid consuming high-goitrogenic foods raw in large amounts (raw broccoli, kale, cabbage). Ensure adequate selenium (Brazil nuts, tuna) and zinc (beef, pumpkin seeds) in your diet. Eat consistently — skipping meals can further slow metabolism.');
  }
  if (mc.includes('hyperthyroid') || mc.includes('overactive thyroid') || mc.includes('graves')) {
    notes.push('Hyperthyroidism: Your calorie needs may be elevated due to an accelerated metabolism. This plan accounts for higher maintenance requirements. Focus on calorie-dense, nutrient-rich foods. Avoid excessive iodine (seaweed, kelp supplements). Consult your doctor about specific dietary restrictions.');
  }
  if (mc.includes('cardiovascular') || mc.includes('heart disease') || mc.includes('hypertension') || mc.includes('high blood pressure')) {
    notes.push('Cardiovascular Health / Hypertension: Prioritize omega-3 fatty acids (salmon, walnuts, chia seeds), reduce sodium (aim for under 2,300mg/day), and limit saturated fats. Olive oil, avocado, and fatty fish are ideal fat sources. Avoid processed meats, fried foods, and high-sodium condiments.');
  }
  if (mc.includes('celiac') || mc.includes('gluten intolerance') || mc.includes('gluten sensitivity')) {
    notes.push('Celiac / Gluten Intolerance: All gluten-containing grains (wheat, barley, rye) have been excluded. Stick to certified gluten-free oats, rice, quinoa, potatoes, and corn. Always read labels — gluten hides in sauces, marinades, and seasonings.');
  }
  if (mc.includes('ibs') || mc.includes('irritable bowel') || mc.includes('crohn') || mc.includes('colitis')) {
    notes.push('IBS / Digestive Conditions: Prioritize easy-to-digest proteins (eggs, chicken, fish) and cooked vegetables over raw. Introduce higher-fiber foods gradually. Some people with IBS respond well to a low-FODMAP approach — consider tracking which foods trigger flare-ups. Avoid artificial sweeteners and excessive fat at single meals.');
  }

  return notes;
}

// --- Past Nutrition Experience Note ---

function getPastExperienceNote(profile) {
  if (!profile || !profile.pastNutrition) return '';
  const exp = profile.pastNutrition.trim();
  if (!exp) return '';

  const lower = exp.toLowerCase();
  let insight = '';

  if (lower.includes('keto') || lower.includes('ketogenic')) {
    insight = 'You have tried keto before. This plan respects your experience with low-carb eating. If you felt well on keto, the macros here lean toward lower carbs to build on what worked for you.';
  } else if (lower.includes('calorie count') || lower.includes('counting calories') || lower.includes('myfitnesspal') || lower.includes('tracking')) {
    insight = 'You have experience tracking calories. Use this plan with your tracking app — the macro targets here are your daily goals. Precision tracking in the first 2–3 weeks will help calibrate your portions.';
  } else if (lower.includes('intermittent fasting') || lower.includes('if') || lower.includes('16:8') || lower.includes('fasting')) {
    insight = 'You have experience with intermittent fasting. Meal timing in this plan respects your eating window. If you prefer to keep a fasting protocol, simply compress the meal schedule into your window.';
  } else if (lower.includes('didn\'t work') || lower.includes('failed') || lower.includes('gave up') || lower.includes('too hard') || lower.includes('too strict')) {
    insight = 'Previous plans felt too restrictive or hard to maintain. This plan is designed for sustainability — it accounts for your food preferences and lifestyle, not just numbers. Flexibility beats perfection every time.';
  } else if (lower.includes('yo-yo') || lower.includes('gained it back') || lower.includes('lost and regained')) {
    insight = 'You have experienced yo-yo dieting. The focus here is on a modest, sustainable calorie adjustment rather than a crash approach — this protects your metabolism and makes results last.';
  } else {
    insight = `Based on your experience — "${exp}" — this plan has been designed to build on what you know and address gaps. Track what is working and what is not, and adjust as you progress.`;
  }

  return insight;
}

// --- Build Plan HTML ---

function buildPlanHTML(data) {
  let personalNoteHTML = '';
  if (data.personalNote && data.personalNote.trim()) {
    personalNoteHTML = `
      <div class="plan-section">
        <h3>Personal Notes</h3>
        <div class="personal-note-box">${data.personalNote.replace(/\n/g, '<br>')}</div>
      </div>
    `;
  }

  let medicalHTML = '';
  if (data.medicalAdjustments && data.medicalAdjustments.length > 0) {
    medicalHTML = `
      <div class="plan-section">
        <h3>Medical & Health Considerations</h3>
        <ul class="tips-list">
          ${data.medicalAdjustments.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  let pastExpHTML = '';
  if (data.pastExperienceNote && data.pastExperienceNote.trim()) {
    pastExpHTML = `
      <div class="plan-section">
        <h3>Based on Your Nutrition History</h3>
        <div class="personal-note-box">${data.pastExperienceNote}</div>
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
    ${medicalHTML}
    ${pastExpHTML}

    <div class="plan-section">
      <h3>Daily Totals</h3>
      <div class="daily-totals">
        <div class="total-row total-row-sub"><span>BMR (Basal Metabolic Rate)</span><span>${data.bmr} kcal</span></div>
        <div class="total-row total-row-sub"><span>TDEE (Total Daily Energy Expenditure)</span><span>${data.tdee} kcal</span></div>
        <div class="total-row total-row-highlight"><span>Calorie Target — ${data.goalLabel}</span><span>${data.calorieTarget} kcal</span></div>
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

// --- Preview ---

function buildMealCardHTML(mealIdx, meal) {
  const optionsHTML = ['A', 'B', 'C'].map(slot => {
    const opt = meal[`option${slot}`];
    return `
      <div class="meal-option">
        <div class="meal-option-header">
          <h5>Option ${slot}: ${opt.title}</h5>
          <button class="btn-swap" onclick="swapMealOption(${mealIdx}, '${slot}')">↺ Swap</button>
        </div>
        <div class="recipe-section">
          <strong>Ingredients:</strong>
          <ul>${opt.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
          <strong>Instructions:</strong>
          <ol>${opt.instructions.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="meal-card" id="meal-card-${mealIdx}">
      <h4>${meal.name}</h4>
      <div class="meal-macros">
        ${meal.calories} cal | P: ${meal.protein}g | C: ${meal.carbs}g | F: ${meal.fats}g
      </div>
      ${optionsHTML}
    </div>
  `;
}

function swapMealOption(mealIdx, slot) {
  if (!currentPlanData) return;
  const meal = currentPlanData.mealPlan[mealIdx];
  const historyKey = `${mealIdx}-${slot}`;

  if (!swapHistory[historyKey]) {
    swapHistory[historyKey] = new Set([meal[`option${slot}`].title]);
  }

  const pool = getFullOptionPool(
    mealIdx,
    currentPlanData.mealsPerDay,
    meal.protein, meal.carbs, meal.fats,
    clientProfile
  );

  const seen = swapHistory[historyKey];
  let unseen = pool.filter(o => !seen.has(o.title));

  if (unseen.length === 0) {
    swapHistory[historyKey] = new Set([meal[`option${slot}`].title]);
    unseen = pool.filter(o => o.title !== meal[`option${slot}`].title);
  }

  if (unseen.length === 0) return;

  const next = unseen[0];
  swapHistory[historyKey].add(next.title);
  currentPlanData.mealPlan[mealIdx][`option${slot}`] = next;

  const cardEl = document.getElementById(`meal-card-${mealIdx}`);
  if (cardEl) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildMealCardHTML(mealIdx, currentPlanData.mealPlan[mealIdx]);
    cardEl.replaceWith(tmp.firstElementChild);
  }
}

function buildPreviewHTML(data) {
  const mealsHTML = data.mealPlan.map((meal, idx) => buildMealCardHTML(idx, meal)).join('');

  return `
    <div class="preview-adjust">
      <h3>Review &amp; Adjust</h3>
      <p class="preview-meta">BMR: ${data.bmr} kcal &nbsp;&middot;&nbsp; TDEE: ${data.tdee} kcal &nbsp;&middot;&nbsp; Goal: ${data.goalLabel}</p>
      <div class="preview-macro-grid">
        <div class="form-group">
          <label>Daily Calorie Target (kcal)</label>
          <input type="number" id="preview-calories" value="${data.calorieTarget}">
        </div>
        <div class="form-group">
          <label>Protein (g)</label>
          <input type="number" id="preview-protein" value="${data.proteinGrams}">
        </div>
        <div class="form-group">
          <label>Carbohydrates (g)</label>
          <input type="number" id="preview-carbs" value="${data.carbsGrams}">
        </div>
        <div class="form-group">
          <label>Fat (g)</label>
          <input type="number" id="preview-fat" value="${data.fatGrams}">
        </div>
      </div>
    </div>

    <div class="plan-section">
      <h3>Meal Plan (${data.mealsPerDay} meals/day)</h3>
      ${mealsHTML}
    </div>
  `;
}

function attachPreviewListeners() {
  const calInput = document.getElementById('preview-calories');
  const pInput   = document.getElementById('preview-protein');
  const cInput   = document.getElementById('preview-carbs');
  const fInput   = document.getElementById('preview-fat');

  calInput.addEventListener('input', () => {
    const cals = parseInt(calInput.value) || 0;
    const { proteinPercent, carbsPercent, fatPercent } = currentPlanData;
    pInput.value = Math.round(cals * proteinPercent / 4);
    cInput.value = Math.round(cals * carbsPercent / 4);
    fInput.value = Math.round(cals * fatPercent / 9);
  });

  [pInput, cInput, fInput].forEach(inp => {
    inp.addEventListener('input', () => {
      const p = parseInt(pInput.value) || 0;
      const c = parseInt(cInput.value) || 0;
      const f = parseInt(fInput.value) || 0;
      calInput.value = p * 4 + c * 4 + f * 9;
    });
  });
}

function approveAndExport() {
  if (!currentPlanData) return;

  const editedCalories = parseInt(document.getElementById('preview-calories').value) || currentPlanData.calorieTarget;
  const editedProtein  = parseInt(document.getElementById('preview-protein').value)  || currentPlanData.proteinGrams;
  const editedCarbs    = parseInt(document.getElementById('preview-carbs').value)    || currentPlanData.carbsGrams;
  const editedFat      = parseInt(document.getElementById('preview-fat').value)      || currentPlanData.fatGrams;

  currentPlanData = {
    ...currentPlanData,
    calorieTarget: editedCalories,
    proteinGrams:  editedProtein,
    proteinCals:   editedProtein * 4,
    carbsGrams:    editedCarbs,
    carbsCals:     editedCarbs * 4,
    fatGrams:      editedFat,
    fatCals:       editedFat * 9,
  };

  currentPlanData.mealPlan = generateMealPlan(
    currentPlanData.mealsPerDay,
    currentPlanData.proteinGrams,
    currentPlanData.carbsGrams,
    currentPlanData.fatGrams,
    currentPlanData.calorieTarget,
    currentPlanData.goal,
    clientProfile
  );

  exportPDF();
  showStep('step-client');
}

// --- PDF Export ---

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const data = currentPlanData;
  const mealPlan = data.mealPlan;
  const tips = generateTips(data.goal, selectedClient);
  const foodList = getFoodList(data);
  const groceryList = getWeeklyGroceryList(data);
  const mealTiming = getMealTiming(data.mealsPerDay, selectedClient);
  const workoutNutrition = getWorkoutNutrition(data.goal, selectedClient);
  const foodsToAvoid = getFoodsToAvoid(data.goal, selectedClient);
  const progressNote = getProgressNote(data.goal, data.weight);
  const medicalAdjustments = getMedicalAdjustments(clientProfile);
  const pastExperienceNote = getPastExperienceNote(clientProfile);

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
    sectionTitle('Personal Notes');
    bodyText(data.personalNote);
    y += 4;
  }

  // --- Medical Adjustments ---
  if (medicalAdjustments && medicalAdjustments.length > 0) {
    sectionTitle('Medical & Health Considerations');
    medicalAdjustments.forEach(note => {
      checkPage(8);
      bodyText(`• ${note}`);
      y += 2;
    });
    y += 2;
  }

  // --- Past Nutrition Experience ---
  if (pastExperienceNote && pastExperienceNote.trim()) {
    sectionTitle('Based on Your Nutrition History');
    bodyText(pastExperienceNote);
    y += 4;
  }

  // --- Daily Totals ---
  checkPage(46);
  doc.setFillColor(22, 33, 62);
  doc.roundedRect(margin, y, contentWidth, 46, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Daily Totals', margin + 6, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`BMR: ${data.bmr} kcal  |  TDEE: ${data.tdee} kcal`, margin + 6, y + 14);
  doc.text(`Calorie Target (${data.goalLabel}): ${data.calorieTarget} kcal`, margin + 6, y + 21);
  doc.text(`Protein: ${data.proteinGrams}g / ${data.proteinCals} kcal  |  Carbs: ${data.carbsGrams}g / ${data.carbsCals} kcal  |  Fats: ${data.fatGrams}g / ${data.fatCals} kcal`, margin + 6, y + 28);
  y += 56;

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
