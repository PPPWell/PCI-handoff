import type { Locale } from "../i18n";
export const formPreviewCopy = {
  zh:{required:"必选项尚未勾选",code:"验证码",resend:"重新发送验证码",verify:"验证",continue:"继续",networkTitle:"网络错误",reconnected:"已重新联网",reconnectedDetail:"联网核实券的状态后再出示使用。",consent:"[必选同意项措辞，待律师审定]"},
  it:{required:"Casella obbligatoria non selezionata",code:"Codice di verifica",resend:"Invia un nuovo codice",verify:"Verifica",continue:"Continua",networkTitle:"Errore di rete",reconnected:"Connessione ripristinata",reconnectedDetail:"Verifica lo stato aggiornato del voucher prima di usarlo.",consent:"[Testo del consenso obbligatorio da approvare dal legale]"},
  en:{required:"Required consent is unchecked",code:"Verification code",resend:"Resend code",verify:"Verify",continue:"Continue",networkTitle:"Network error",reconnected:"Connected again",reconnectedDetail:"Check the current voucher status online before using it.",consent:"[Required consent wording awaiting legal approval]"},
};
export function verificationErrorPreviews(locale: Locale) {
  const ids=["code-incorrect","code-expired","code-rate-limited","refund-code-incorrect","refund-code-locked"];
  const titles={zh:["登录验证码错误","登录验证码过期","发送太频繁","退款验证码错误","退款验证暂时锁定"],it:["Codice di accesso errato","Codice di accesso scaduto","Troppi invii","Codice di rimborso errato","Verifica del rimborso bloccata"],en:["Incorrect sign-in code","Expired sign-in code","Too many requests","Incorrect refund code","Refund verification locked"]}[locale];
  const messages={zh:["验证码不对，还可尝试 [N] 次。","验证码已过期，请重新发送。","请在 [N] 秒后重试。","验证码不对，还可尝试 [N] 次。","请在 [N] 分钟后重试。"],it:["Codice errato: restano [N] tentativi.","Il codice è scaduto: richiedine uno nuovo.","Riprova tra [N] secondi.","Codice errato: restano [N] tentativi.","Riprova tra [N] minuti."],en:["The code is incorrect; [N] attempts remain.","The code expired. Request a new one.","Try again in [N] seconds.","The code is incorrect; [N] attempts remain.","Try again in [N] minutes."]}[locale];
  return ids.map((id,index)=>({id,title:titles[index],message:messages[index],expired:id==="code-expired"}));
}
