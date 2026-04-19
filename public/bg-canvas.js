/**
 * TrackerPro — 3D Animated Background
 * Floating geometric mesh with mouse parallax
 */

let canvas, ctx;
let particles = [];
let mouse = { x: 0, y: 0 };
let animationId;

const COLORS = ['#ff8c00', '#ffd700', '#00ff7f', '#00f3ff', '#ff69b4'];

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.z = Math.random() * 1000 + 200;
        this.size = Math.random() * 40 + 15;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.shape = Math.floor(Math.random() * 3);
        this.opacity = Math.random() * 0.4 + 0.1;
    }

    update(mx, my) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;

        const dx = (mx - canvas.width / 2) * (500 / this.z);
        const dy = (my - canvas.height / 2) * (500 / this.z);
        this.x += dx * 0.001;
        this.y += dy * 0.001;

        if (this.x < -100) this.x = canvas.width + 100;
        if (this.x > canvas.width + 100) this.x = -100;
        if (this.y < -100) this.y = canvas.height + 100;
        if (this.y > canvas.height + 100) this.y = -100;
    }

    draw() {
        const scale = 500 / this.z;
        const size = this.size * scale;
        const alpha = this.opacity * (1 - this.z / 1200);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = Math.max(0.05, alpha);
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;

        if (this.shape === 0) {
            ctx.beginPath();
            const r = size / 2;
            ctx.moveTo(r, 0);
            for (let i = 1; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.globalAlpha *= 0.6;
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.stroke();
        } else if (this.shape === 1) {
            ctx.strokeRect(-size / 2, -size / 2, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.globalAlpha *= 0.4;
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.stroke();
        }

        ctx.restore();
    }
}

const initBg = () => {
    canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    resize();
    
    const count = Math.min(25, Math.floor(window.innerWidth / 50));
    particles = Array.from({ length: count }, () => new Particle());
    
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    document.addEventListener('touchmove', (e) => {
        if (e.touches[0]) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    });
    
    animate();
};

const resize = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};

const animate = () => {
    if (!ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.sort((a, b) => b.z - a.z);
    
    particles.forEach(p => {
        p.update(mouse.x, mouse.y);
        p.draw();
    });
    
    animationId = requestAnimationFrame(animate);
};

document.addEventListener('DOMContentLoaded', initBg);