export {
  default,
  sendHireMindXEmailNotification,
  renderHireMindXEmailTemplate,
  getHireMindXNotificationBaseUrl,
} from "@/lib/email";

export type {
  HireMindXEmailNotificationMetadataItem,
  HireMindXEmailNotificationParams as SendHireMindXEmailNotificationParams,
  HireMindXRenderedEmailTemplate,
  HireMindXEmailSendResult,
} from "@/lib/email";
