import { PrintShell } from "../components/PrintShell";

export default function PrintSelfRegisterQR() {
  const registerUrl = `${window.location.origin}/self-register`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(registerUrl)}`;

  return (
    <PrintShell title="Patient Self-Registration" subtitle="Scan to register before your visit" backTo="/reception" backLabel="Back to Reception">
      <div className="flex flex-col items-center py-6">
        <img src={qrImageUrl} alt="Self-registration QR code" className="w-64 h-64 border border-slate-200 rounded-lg" />
        <p className="text-sm text-slate-600 mt-6 text-center max-w-sm">
          Scan this code with your phone's camera to fill in your registration details and consent form before being seen.
          Once submitted, please take a seat — reception will call you to confirm your details.
        </p>
        <p className="text-xs text-slate-400 mt-4 break-all text-center">{registerUrl}</p>
      </div>
    </PrintShell>
  );
}
