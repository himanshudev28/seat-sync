import { parseTicketUrl } from "@/lib/tickets";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, RefreshCw, Keyboard, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Scanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);

  const startScanner = async (cameraId?: string) => {
    const scannerId = "qr-scanner";
    
    try {
      // Stop existing scanner
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // Not running yet (first start) or already stopped: nothing to clean up.
        }
      }
      
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      // Get cameras if not already available
      let cameraIdToUse = cameraId;
      if (!cameraIdToUse) {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices.map(d => ({ id: d.id, label: d.label })));
          // Find back camera (usually has "back" or "rear" in label, or is the second camera)
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes("back") || 
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
          );
          cameraIdToUse = backCamera?.id || devices[0].id;
          // Set index to back camera
          const idx = devices.findIndex(d => d.id === cameraIdToUse);
          setCurrentCameraIndex(idx >= 0 ? idx : 0);
        }
      }

      if (!cameraIdToUse) {
        setError("No camera found");
        // Leave the scanning state so the "Camera unavailable" screen (with Try again) shows.
        setScanning(false);
        return;
      }

      const config = { fps: 20, qrbox: { width: 300, height: 300 } };
      
      await html5QrCode.start(
        cameraIdToUse,
        config,
        (decodedText) => {
          setScanSuccess(true);

          const ticket = parseTicketUrl(decodedText);
          if (ticket) {
            html5QrCode.stop().then(() => {
              // Same site: stay in the app. Another allowed SeatSync origin: full navigation.
              if (ticket.sameOrigin) navigate(ticket.url.pathname);
              else window.location.assign(ticket.url.href);
            });
          } else {
            setError("Invalid SeatSync QR - scan a ticket QR code");
            setTimeout(() => setError(""), 2000);
            setScanSuccess(false);
          }
        },
        (errorMessage) => {
          console.debug("Scan attempt:", errorMessage);
        }
      );
      setScanning(true);
    } catch (err: unknown) {
      console.error("Scanner error:", err);
      setError((err instanceof Error && err.message) || "Camera access denied");
      setScanning(false);
    }
  };

  useEffect(() => {
    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
    // Start the camera once on mount; startScanner is re-created every render and must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = () => {
    if (cameras.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      startScanner(cameras[nextIndex].id);
    }
  };

  const handleManualEntry = () => {
    const bookingId = prompt("Enter booking ID:");
    if (bookingId && /^[a-f0-9]{24}$/i.test(bookingId)) {
      navigate(`/validate/${bookingId}`);
    } else {
      setError("Invalid booking ID format");
      setTimeout(() => setError(""), 2000);
    }
  };

  const cameraDenied = !scanning && Boolean(error);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center text-card-foreground">
        <h1 className="font-display text-section">Scan ticket</h1>
        <p className="mb-5 mt-1 text-base text-muted-foreground">Point the camera at the attendee's QR code</p>

        <div
          id="qr-scanner"
          ref={videoContainerRef}
          className={`relative mx-auto mb-5 h-[280px] w-full max-w-[280px] overflow-hidden rounded-2xl border-2 bg-surface-secondary ${
            scanSuccess ? "border-success" : "border-border"
          } ${cameraDenied ? "hidden" : ""}`}
        />

        {cameraDenied && (
          <div role="alert" className="mx-auto mb-5 flex max-w-[280px] flex-col items-center gap-3 rounded-2xl bg-surface-secondary p-6">
            <CameraOff className="h-10 w-10 text-destructive" aria-hidden="true" />
            <p className="text-lg font-semibold">Camera unavailable</p>
            <p className="text-sm text-muted-foreground">
              Allow camera access in your browser settings, then try again. You can also enter the booking ID manually.
            </p>
            <Button variant="secondary" className="h-12 w-full" onClick={() => startScanner()}>
              <Camera className="mr-2 h-4 w-4" aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {scanSuccess && !error && (
          <p role="status" className="mb-4 flex items-center justify-center gap-2 text-base font-medium text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> QR code detected
          </p>
        )}

        {error && !cameraDenied && (
          <p role="alert" className="mb-4 flex items-center justify-center gap-2 text-base font-medium text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}

        {cameras.length > 1 && (
          <Button variant="secondary" className="mb-3 h-12 w-full" onClick={switchCamera}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Switch camera ({currentCameraIndex === 0 ? "Front" : "Back"} to {currentCameraIndex === 0 ? "Back" : "Front"})
          </Button>
        )}

        <Button variant="secondary" className="h-12 w-full" onClick={handleManualEntry}>
          <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" /> Enter booking ID manually
        </Button>

        <p className="mt-6 text-label text-muted-foreground">SeatSync</p>
      </div>
    </main>
  );
}
