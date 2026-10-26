// Nội dung trò chơi – lấy đúng từ phần III của bộ slide
// vote  : dự thảo, biểu quyết Tán thành (đúng) / Không tán thành (sai); sai hoặc không bỏ phiếu → bị bãi nhiệm
// text  : Phiên chất vấn – chỉ người đã bị bãi nhiệm trả lời, N người đúng nhanh nhất được tái cử
// multi : Phiên bỏ phiếu kín – chỉ người còn đương nhiệm, chọn đúng đủ các phương án

export type VoteStep = {
  id: string;
  kind: "vote";
  title: string;
  text: string;
  correct: boolean;
  why: string;
  seconds: number;
};
export type TextStep = {
  id: string;
  kind: "text";
  title: string;
  text: string;
  accept: string[]; // so khớp sau khi bỏ dấu, viết thường
  answerLabel: string;
  why: string;
  seconds: number;
  revive: number;
};
export type MultiStep = {
  id: string;
  kind: "multi";
  title: string;
  text: string;
  options: string[];
  correct: number[];
  why: string;
  seconds: number;
};
export type Step = VoteStep | TextStep | MultiStep;

export const STEPS: Step[] = [
  {
    id: "dt1", kind: "vote", title: "Dự thảo số 1", seconds: 12, correct: true,
    text: "Dân chủ xã hội chủ nghĩa vừa là mục tiêu, vừa là động lực của sự phát triển đất nước.",
    why: "Đảng ta khẳng định: “Dân chủ xã hội chủ nghĩa là bản chất của chế độ ta, vừa là mục tiêu, vừa là động lực của sự phát triển đất nước.”",
  },
  {
    id: "dt2", kind: "vote", title: "Dự thảo số 2", seconds: 12, correct: false,
    text: "Quyền lực nhà nước ở Việt Nam được tổ chức theo nguyên tắc “tam quyền phân lập”.",
    why: "Quyền lực nhà nước là thống nhất, có sự phân công, phối hợp, kiểm soát giữa các cơ quan nhà nước trong việc thực hiện các quyền lập pháp, hành pháp, tư pháp.",
  },
  {
    id: "dt3", kind: "vote", title: "Dự thảo số 3", seconds: 12, correct: false,
    text: "Nền dân chủ nhân dân ở Việt Nam ra đời từ Đại hội VI của Đảng năm 1986.",
    why: "Nền dân chủ nhân dân ra đời sau Cách mạng tháng 8/1945. Đại hội VI (1986) rút ra bài học “lấy dân làm gốc”.",
  },
  {
    id: "dt4", kind: "vote", title: "Dự thảo số 4", seconds: 12, correct: true,
    text: "Nhà nước pháp quyền XHCN Việt Nam phải do Đảng Cộng sản Việt Nam lãnh đạo, phù hợp với Điều 4 Hiến pháp năm 2013.",
    why: "Đây là đặc điểm thứ tư của Nhà nước pháp quyền xã hội chủ nghĩa Việt Nam.",
  },
  {
    id: "cv", kind: "text", title: "Phiên chất vấn", seconds: 20, revive: 3,
    text: "Hoàn thành phương châm giám sát của nhân dân: “Dân biết, dân bàn, dân làm, dân …”",
    accept: ["kiem tra", "dan kiem tra"],
    answerLabel: "kiểm tra",
    why: "Hoạt động của Nhà nước được giám sát bởi nhân dân với phương châm: “Dân biết, dân bàn, dân làm, dân kiểm tra” (đặc điểm thứ tư).",
  },
  {
    id: "dt5", kind: "vote", title: "Dự thảo số 5", seconds: 12, correct: false,
    text: "Dân chủ nghĩa là mỗi người được tự do làm mọi điều mình muốn, không cần kỷ luật, kỷ cương.",
    why: "Dân chủ gắn liền với kỷ luật, kỷ cương và phải được thể chế hóa bằng pháp luật, được pháp luật bảo đảm.",
  },
  {
    id: "dt6", kind: "vote", title: "Dự thảo số 6", seconds: 12, correct: true,
    text: "Nhân dân có quyền bầu và bãi miễn những đại biểu không xứng đáng.",
    why: "Đặc điểm thứ năm của Nhà nước pháp quyền XHCN Việt Nam – và cũng chính là luật của trò chơi này!",
  },
  {
    id: "bpk", kind: "multi", title: "Phiên bỏ phiếu kín", seconds: 25,
    text: "Quyền lực nhà nước là thống nhất, có sự phân công, phối hợp, kiểm soát giữa các cơ quan nhà nước trong việc thực hiện ba quyền nào?",
    options: ["Lập pháp", "Giám sát", "Hành pháp", "Kiểm toán", "Tư pháp", "Phản biện xã hội"],
    correct: [0, 2, 4],
    why: "“Quyền lực nhà nước là thống nhất, có sự phân công, phối hợp, kiểm soát giữa các cơ quan nhà nước trong việc thực hiện các quyền lập pháp, hành pháp, tư pháp.”",
  },
];

export const SCORING = {
  voteBase: 100,
  voteSpeed: 50,
  reviveBonus: 50,
  multiBase: 200,
  multiSpeed: 100,
  graceMs: 1500, // chấp nhận phiếu tới trễ do mạng
};

// Phần công khai của một bước (không lộ đáp án khi chưa công bố)
export type PublicStep = {
  id: string;
  kind: Step["kind"];
  title: string;
  text: string;
  seconds: number;
  options?: string[];
  pick?: number;
  revive?: number;
};
export function publicStep(step: Step): PublicStep {
  const base = { id: step.id, kind: step.kind, title: step.title, text: step.text, seconds: step.seconds };
  if (step.kind === "multi") return { ...base, options: step.options, pick: step.correct.length };
  if (step.kind === "text") return { ...base, revive: step.revive };
  return base;
}

export function revealOf(step: Step) {
  if (step.kind === "vote") return { correct: step.correct, why: step.why };
  if (step.kind === "text") return { answer: step.answerLabel, why: step.why };
  return { correct: step.correct, why: step.why };
}
