import cv2
import numpy as np
import math

img = cv2.imread("Foto2.png1")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Suavizado
blur = cv2.GaussianBlur(gray, (5, 5), 0)

# Bordes
edges = cv2.Canny(blur, 50, 150)

# Detección de líneas
lines = cv2.HoughLinesP(
    edges,
    rho=1,
    theta=np.pi / 180,
    threshold=80,
    minLineLength=80,
    maxLineGap=15
)

output = img.copy()

if lines is not None:
    for line in lines:
        x1, y1, x2, y2 = line[0]

        dx = x2 - x1
        dy = y2 - y1

        angle = math.degrees(math.atan2(dy, dx))

        # Dibujar línea
        cv2.line(output, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # Mostrar ángulo
        mx = int((x1 + x2) / 2)
        my = int((y1 + y2) / 2)
        cv2.putText(
            output,
            f"{angle:.1f}",
            (mx, my),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 255),
            1
        )

cv2.imshow("Bordes", edges)
cv2.imshow("Lineas y angulos", output)
cv2.waitKey(0)
cv2.destroyAllWindows()