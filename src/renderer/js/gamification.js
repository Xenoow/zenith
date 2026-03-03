// ===== XP / Level popup =====
let xpPopupTimeout  = null;
let badgePopTimeout = null;

function showXpPopup(result) {
  const popup = document.getElementById('xp-popup');

  let msg;
  if (result.leveledUp) {
    msg = `🎉 Niveau ${result.newLevel} ! +${result.xpEarned} XP`;
  } else if (result.isEarly && result.bonusXp > 0) {
    msg = `+${result.xpEarned} XP ⚡ En avance (+${result.bonusXp})`;
  } else {
    msg = `+${result.xpEarned} XP`;
  }

  popup.textContent = msg;
  popup.classList.remove('hidden', 'badge-popup');

  if (xpPopupTimeout) clearTimeout(xpPopupTimeout);
  xpPopupTimeout = setTimeout(() => popup.classList.add('hidden'), 2500);

  // Badge notifications after XP popup
  if (result.newBadges && result.newBadges.length > 0) {
    result.newBadges.forEach((badge, i) => {
      setTimeout(() => showBadgePopup(badge), 1200 + i * 1600);
    });
  }
}

function showBadgePopup(badge) {
  const popup = document.getElementById('xp-popup');
  popup.textContent = `${badge.icon} Badge débloqué : ${badge.label}`;
  popup.classList.remove('hidden');
  popup.classList.add('badge-popup');

  if (badgePopTimeout) clearTimeout(badgePopTimeout);
  badgePopTimeout = setTimeout(() => {
    popup.classList.add('hidden');
    popup.classList.remove('badge-popup');
  }, 2800);
}

window.showXpPopup   = showXpPopup;
window.showBadgePopup = showBadgePopup;
