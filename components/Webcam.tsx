"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type WebcamHandle = {
  /** Grab the current frame as a JPEG blob (or null if not ready). */
  captureFrame: () => Promise<Blob | null>;
  isReady: () => boolean;
};

type Props = {
  onError?: (message: string) => void;
};

const Webcam = forwardRef<WebcamHandle, Props>(function Webcam(
  { onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        onError?.(
          e instanceof Error ? e.message : "Could not access the camera.",
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onError]);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({ captureFrame, isReady: () => ready }),
    [captureFrame, ready],
  );

  return (
    <video
      ref={videoRef}
      className="h-full w-full -scale-x-100 object-cover"
      autoPlay
      playsInline
      muted
    />
  );
});

export default Webcam;
