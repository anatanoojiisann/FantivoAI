const segmented = document.querySelector("[data-segmented]");
const uploadDemo = document.querySelector("[data-upload-demo]");
const prompt = document.querySelector("[data-prompt]");
const count = document.querySelector("[data-count]");
const generate = document.querySelector("[data-generate]");
const consent = document.querySelector("[data-consent]");
const payment = document.querySelector("[data-payment]");
const jobCard = document.querySelector("[data-job-card]");
const stateLabel = document.querySelector("[data-state-label]");
const stateDetail = document.querySelector("[data-state-detail]");
const stateIconUse = document.querySelector("[data-state-icon] use");

segmented?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  segmented.querySelectorAll("button").forEach((item) => item.classList.toggle("is-selected", item === button));
  uploadDemo.hidden = button.dataset.mode !== "image";
});

prompt?.addEventListener("input", () => {
  const length = prompt.value.length;
  count.textContent = String(length);
  generate.disabled = length === 0;
});

consent?.addEventListener("change", () => {
  payment.disabled = !consent.checked;
});

const jobStates = {
  working: {
    label: "生成中",
    detail: "68% · 正在创建帧",
    icon: "#icon-clock",
    actions: ["查看详情", "取消任务"],
  },
  done: {
    label: "已完成",
    detail: "输出已就绪",
    icon: "#icon-check",
    actions: ["查看详情", "再次创作"],
  },
  error: {
    label: "失败",
    detail: "积分已退回 · 查看原因",
    icon: "#icon-alert",
    actions: ["查看原因", "重新创作"],
  },
};

document.querySelectorAll("[data-job-state]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = button.dataset.jobState;
    const config = jobStates[state];
    if (!config || !jobCard) return;
    document.querySelectorAll("[data-job-state]").forEach((item) => item.classList.toggle("is-selected", item === button));
    jobCard.dataset.state = state;
    stateLabel.textContent = config.label;
    stateDetail.textContent = config.detail;
    stateIconUse.setAttribute("href", config.icon);
    const actions = jobCard.querySelectorAll(".job-card-demo__body > div:last-child button");
    actions.forEach((action, index) => { action.textContent = config.actions[index] || ""; });
  });
});
