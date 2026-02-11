const PLAYER_NAME = "小音";
const NPC_NAME = "小白";

const DIALOGUES = [
  "你好呀，{player}！今天准备好冒险了吗？",
  "放心吧，{npc} 会一直陪着你。",
  "先去村口看看，有人正在等你呢。",
  "做得很好，{player}，继续加油！",
];

const speakerLabel = document.getElementById("speakerLabel");
const dialogueText = document.getElementById("dialogueText");
const nextBtn = document.getElementById("nextBtn");

let currentDialogueIndex = 0;

function renderDialogue(index) {
  const template = DIALOGUES[index % DIALOGUES.length];
  const sentence = template
    .replaceAll("{player}", PLAYER_NAME)
    .replaceAll("{npc}", NPC_NAME);

  speakerLabel.textContent = `${NPC_NAME}：`;
  dialogueText.textContent = `${NPC_NAME}：${sentence}`;
}

nextBtn.addEventListener("click", () => {
  currentDialogueIndex += 1;
  renderDialogue(currentDialogueIndex);
});

renderDialogue(currentDialogueIndex);
