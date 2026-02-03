import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect, GodRaysEffect } from 'postprocessing';

// ... (Utils same as before) ...
function getStoneTexture() {
    const s = 1024, c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#34495e'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let r = 100; r < s; r += 100) { ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2); }
    ctx.stroke();
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a252f' : '#3e5871';
        ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
    return t;
}
const stoneTex = getStoneTexture();
function getNoiseTexture() {
    const s = 512, c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#999999'; ctx.fillRect(0, 0, s, s);
    const d = ctx.getImageData(0, 0, s, s), data = d.data;
    for (let i = 0; i < data.length; i += 4) { const g = (Math.random() - 0.5) * 15; data[i] += g; data[i + 1] += g; data[i + 2] += g; }
    ctx.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}
const noiseTex = getNoiseTexture();

// SETUP
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance", antialias: false, depth: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 10, 80);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 30, 40);
camera.lookAt(0, 0, 0);

// ENVIRONMENT
scene.environment = (new THREE.PMREMGenerator(renderer)).fromScene(new RoomEnvironment(), 0.04).texture;

// GOD RAYS SOURCE
const sunGeo = new THREE.SphereGeometry(4, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.set(0, 20, -30);
scene.add(sunMesh);

// LIGHTS
const moonLight = new THREE.DirectionalLight(0x6a89cc, 2.0);
moonLight.position.copy(sunMesh.position); moonLight.castShadow = true; moonLight.shadow.mapSize.set(2048, 2048);
scene.add(moonLight);
const fillLight = new THREE.AmbientLight(0x404040, 1.0); scene.add(fillLight);
const torchLight = new THREE.PointLight(0xff9f43, 3, 50); torchLight.position.set(0, 8, 0); scene.add(torchLight);

// PHYSICS
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
const mats = { g: new CANNON.Material(), p: new CANNON.Material(), w: new CANNON.Material() };
world.addContactMaterial(new CANNON.ContactMaterial(mats.g, mats.p, { friction: 0.1, restitution: 0.0 }));
world.addContactMaterial(new CANNON.ContactMaterial(mats.p, mats.p, { friction: 0.5, restitution: 0.5 }));

// ARENA
const groundGeo = new THREE.CylinderGeometry(22, 22, 1, 64);
const groundMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, color: 0x888888 });
const ground = new THREE.Mesh(groundGeo, groundMat); ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);
const gb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(50, 0.5, 50)), position: new CANNON.Vec3(0, -0.5, 0), material: mats.g }); world.addBody(gb);

// PILLARS
const pillarGeo = new THREE.CylinderGeometry(0.8, 1, 6, 8);
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.9 });
const fireGeo = new THREE.SphereGeometry(0.5); const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9f43 });
for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2; const r = 18; const x = Math.cos(angle) * r; const z = Math.sin(angle) * r;
    const mesh = new THREE.Mesh(pillarGeo, pillarMat); mesh.position.set(x, 3, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(1, 1, 6, 8), position: new CANNON.Vec3(x, 3, z) }); world.addBody(body);
    const fire = new THREE.Mesh(fireGeo, fireMat); fire.position.set(0, 3.5, 0); mesh.add(fire);
}
const chainGeo = new THREE.TorusGeometry(18, 0.2, 8, 64); const chainMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.8, roughness: 0.4 });
const chain = new THREE.Mesh(chainGeo, chainMat); chain.rotation.x = -Math.PI / 2; chain.position.y = 1; scene.add(chain);

// WEAPON
class Weapon {
    constructor(type, x, z) {
        this.type = type; this.mesh = new THREE.Group(); this.equippedBy = null;
        const mat = new THREE.MeshStandardMaterial({ color: type === 'bat' ? 0x8e44ad : 0xecf0f1, metalness: 0.6, roughness: 0.4 });
        if (type === 'bat') {
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 })); handle.position.y = -0.3; this.mesh.add(handle);
            const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 1.2), mat); bat.position.y = 0.5; this.mesh.add(bat);
        } else {
            const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x5e412f })); h.position.y = -0.4; this.mesh.add(h);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.05), mat); blade.position.y = 0.5; this.mesh.add(blade);
        }
        this.body = new CANNON.Body({ mass: 5, shape: new CANNON.Box(new CANNON.Vec3(0.1, 0.6, 0.1)), position: new CANNON.Vec3(x, 5, z), material: mats.w });
        this.mesh.castShadow = true; scene.add(this.mesh); world.addBody(this.body);
    }
    update() {
        if (this.equippedBy) {
            const handPos = new THREE.Vector3(); this.equippedBy.armR.children[0].getWorldPosition(handPos);
            this.mesh.position.copy(handPos); this.mesh.quaternion.copy(this.equippedBy.mesh.quaternion); this.mesh.rotateX(Math.PI / 2);
            if (this.equippedBy.isAttacking) {
                this.mesh.rotation.x -= 1.0;
                this.mesh.position.y -= 0.5;
            }
        } else {
            this.mesh.rotation.y += 0.05;
            this.mesh.position.copy(this.body.position); this.mesh.quaternion.copy(this.body.quaternion);
            if (player && !player.weapon && this.mesh.position.distanceTo(player.mesh.position) < 1.5) {
                this.equip(player);
                if (socket) socket.emit('playerPickup', { id: this.id, type: this.type });
            }
        }
    }
    equip(char) { this.equippedBy = char; char.weapon = this; world.removeBody(this.body); }
    drop() { if (!this.equippedBy) return; this.body.position.copy(this.mesh.position); this.body.velocity.set(0, 5, 0); world.addBody(this.body); this.equippedBy.weapon = null; this.equippedBy = null; }
}

// CHARACTER
class Character {
    constructor(type, isBot = false, startPos, remoteId = null) {
        this.isBot = isBot; this.remoteId = remoteId; this.maxHp = 5; this.hp = this.maxHp; this.isDead = false; this.xp = 0; this.level = 1; this.mesh = new THREE.Group(); this.weapon = null;
        this.colorVal = remoteId ? 0x9b59b6 : (isBot ? 0xFF3333 : (type === 'cat' ? 0x74B9FF : 0xFDCB6E));
        this.mat = new THREE.MeshPhysicalMaterial({ color: this.colorVal, roughness: 0.45, clearcoat: 0.4, roughnessMap: noiseTex, bumpMap: noiseTex, bumpScale: 0.005, transparent: !!remoteId, opacity: remoteId ? 0.8 : 1.0 });
        this.buildBody(type);
        if (!remoteId) {
            this.bodyRadius = 0.5;
            this.body = new CANNON.Body({ mass: 50, shape: new CANNON.Sphere(this.bodyRadius), position: new CANNON.Vec3(startPos.x, 5, startPos.z), material: mats.p, linearDamping: 0.1, angularDamping: 1.0, fixedRotation: true });
            world.addBody(this.body);
        } else { this.mesh.position.set(startPos.x, 0, startPos.z); }
        scene.add(this.mesh);
        this.atkStart = 0; this.isAttacking = false; this.originalColor = new THREE.Color(this.colorVal);
        this.lastJump = 0; // Fix: Jump Cooldown
    }
    buildBody(type) {
        const torso = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.8, 0.7, 4, 0.15), this.mat); torso.position.y = 0.2; torso.castShadow = true; this.mesh.add(torso);
        const snout = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.25, 0.1, 2, 0.05), this.mat); snout.position.set(0, -0.1, 0.35); torso.add(snout);
        const eyeG = new THREE.SphereGeometry(0.09); const eyeM = new THREE.MeshStandardMaterial({ color: 0x111 });
        const e1 = new THREE.Mesh(eyeG, eyeM); e1.position.set(-0.2, 0.15, 0.35); const e2 = e1.clone(); e2.position.x *= -1; torso.add(e1); torso.add(e2);
        const limbG = new RoundedBoxGeometry(0.2, 0.45, 0.2, 4, 0.1);
        this.legL = this.makeLimb(limbG, -0.22, -0.3, 0, torso); this.legR = this.makeLimb(limbG, 0.22, -0.3, 0, torso);
        this.armL = this.makeLimb(limbG, -0.5, 0.1, 0, torso); this.armR = this.makeLimb(limbG, 0.5, 0.1, 0, torso);
        const earG = type === 'bunny' ? new RoundedBoxGeometry(0.15, 0.6, 0.1, 4, 0.05) : new RoundedBoxGeometry(0.2, 0.2, 0.1, 4, 0.05);
        const ear = new THREE.Mesh(earG, this.mat); if (type === 'bunny') { ear.position.set(-0.25, 0.6, 0); ear.rotation.x = -0.1; ear.rotation.z = 0.2; } else { ear.position.set(-0.35, 0.5, 0); }
        const ear2 = ear.clone(); ear2.position.x *= -1; if (type === 'bunny') ear2.rotation.z *= -1; torso.add(ear); torso.add(ear2);
    }
    makeLimb(g, x, y, z, p) { const piv = new THREE.Group(); piv.position.set(x, y, z); const m = new THREE.Mesh(g, this.mat); m.position.y = -0.2; m.castShadow = true; piv.add(m); p.add(piv); return piv; }
    update(dt, time, playerTarget) {
        if (this.isDead) return;
        if (!this.remoteId) this.mesh.position.copy(this.body.position);

        // Fix: Velocity Cap (Anti-Speed Hack)
        const maxSpeed = 20;
        if (this.body && this.body.velocity.length() > maxSpeed) {
            const v = this.body.velocity;
            v.scale(maxSpeed / v.length(), v);
        }

        let inputX = 0, inputZ = 0;
        // ... (rest of update) ...
    }
    takeHit(forceVec, dmg = 1) {
        if (this.isDead || this.remoteId) return; this.hp -= dmg;
        this.mat.color.setHex(0xFFFFFF); setTimeout(() => this.mat.color.copy(this.originalColor), 100);
        this.body.applyImpulse(forceVec, this.body.position);
        if (!this.isBot) { const pct = (this.hp / this.maxHp) * 100; document.getElementById('health-bar-fill').style.width = pct + '%'; }
        if (this.hp <= 0) this.die();
    }
    die() {
        this.isDead = true; if (this.body) { this.body.velocity.set(0, 15, 0); this.body.collisionFilterMask = 0; }
        if (this.isBot && player) player.gainXP(50);
        if (this.weapon) this.weapon.drop();
        setTimeout(() => {
            scene.remove(this.mesh); if (this.body) world.removeBody(this.body);
            if (!this.remoteId && !this.isBot) location.reload();
        }, 2000);
    }
    gainXP(amount) {
        this.xp += amount; const maxXP = this.level * 100; const pct = Math.min((this.xp / maxXP) * 100, 100);
        document.getElementById('xp-bar-fill').style.width = pct + '%';
        if (this.xp >= maxXP) {
            this.level++; this.xp = 0; this.maxHp++; this.hp = this.maxHp;
            document.getElementById('xp-level').innerText = 'LVL ' + this.level; document.getElementById('health-bar-fill').style.width = '100%'; document.getElementById('xp-bar-fill').style.width = '0%';
            this.mat.emissive.setHex(0xffff00); setTimeout(() => this.mat.emissive.setHex(0x000000), 500);
        }
    }
    attack(targetList) {
        if (this.isAttacking || this.isDead) return; this.isAttacking = true; this.atkStart = Date.now();
        if (!this.isBot && !this.remoteId && socket) socket.emit('playerAttack');

        // Fix: Stop current momentum before lunging (Prevents Speed Hack)
        if (this.body) {
            this.body.velocity.x = 0; this.body.velocity.z = 0;
            const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
            this.body.applyImpulse(new CANNON.Vec3(f.x * 15, 0, f.z * 15));
        }

        const range = this.weapon ? 4.0 : 2.5; const dmg = this.weapon ? 2.5 : 1; const knockback = this.weapon ? 60 : 30;
        if (targetList) {
            targetList.forEach(foe => {
                if (foe === this || foe.isDead) return;
                if (this.mesh.position.distanceTo(foe.mesh.position) < range) {
                    const k = new THREE.Vector3().subVectors(foe.mesh.position, this.mesh.position).normalize();
                    const force = new CANNON.Vec3(k.x * knockback, 10, k.z * knockback);

                    // Local Hit
                    if (!foe.remoteId) {
                        foe.takeHit(force, dmg);
                    }
                    // Remote Hit
                    else if (socket) {
                        socket.emit('hitPlayer', { targetId: foe.remoteId, damage: dmg });
                    }
                }
            });
        }
    }
    jump() {
        if (gameState !== 'playing') return; // Fix: No lobby flight
    }
    if(this.isBot) { this.body.velocity.x = inputX * 3.5; this.body.velocity.z = inputZ * 3.5; }
else if(!this.remoteId && gameState === 'playing') { this.body.velocity.x *= 0.9; this.body.velocity.z *= 0.9; }

let speed = 0;
if (!this.remoteId) { const v = this.body.velocity; speed = Math.sqrt(v.x ** 2 + v.z ** 2); } else { speed = 5; } // Fake remote speed

if (this.isAttacking) {
    const prog = (Date.now() - this.atkStart) / 300; if (prog >= 1) this.isAttacking = false;
    else { this.mesh.children[0].rotation.y += 0.8; this.armR.rotation.x = -2.0; }
} else { this.mesh.children[0].rotation.y = THREE.MathUtils.lerp(this.mesh.children[0].rotation.y, 0, 0.2); this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, 0.1); }

if (gameState === 'playing' && speed > 0.5 && !this.isBot && !this.remoteId) {
    const v = this.body.velocity; const angle = Math.atan2(v.x, v.z);
    this.mesh.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), 0.2);
}

if (speed > 0.5) {
    const w = time * 15;
    this.legL.rotation.x = Math.sin(w) * 0.8; this.legR.rotation.x = Math.sin(w + Math.PI) * 0.8;
    this.armL.rotation.x = Math.sin(w + Math.PI) * 0.8; this.armR.rotation.x = Math.sin(w) * 0.8;
    this.mesh.children[0].position.y = 0.2 + Math.abs(Math.sin(w)) * 0.05;
} else {
    this.legL.rotation.x = 0; this.legR.rotation.x = 0; if (!this.isAttacking && !this.weapon) this.armR.rotation.x = 0; this.armL.rotation.x = 0;
    this.mesh.children[0].position.y = 0.2;
}
    }
takeHit(forceVec, dmg = 1) {
    if (this.isDead || this.remoteId) return; this.hp -= dmg;
    this.mat.color.setHex(0xFFFFFF); setTimeout(() => this.mat.color.copy(this.originalColor), 100);
    this.body.applyImpulse(forceVec, this.body.position);
    if (!this.isBot) { const pct = (this.hp / this.maxHp) * 100; document.getElementById('health-bar-fill').style.width = pct + '%'; }
    if (this.hp <= 0) this.die();
}
die() {
    this.isDead = true; if (this.body) { this.body.velocity.set(0, 15, 0); this.body.collisionFilterMask = 0; }
    if (this.isBot && player) player.gainXP(50);
    if (this.weapon) this.weapon.drop();
    setTimeout(() => {
        scene.remove(this.mesh); if (this.body) world.removeBody(this.body);
        if (!this.remoteId && !this.isBot) location.reload();
    }, 2000);
}
gainXP(amount) {
    this.xp += amount; const maxXP = this.level * 100; const pct = Math.min((this.xp / maxXP) * 100, 100);
    document.getElementById('xp-bar-fill').style.width = pct + '%';
    if (this.xp >= maxXP) {
        this.level++; this.xp = 0; this.maxHp++; this.hp = this.maxHp;
        document.getElementById('xp-level').innerText = 'LVL ' + this.level; document.getElementById('health-bar-fill').style.width = '100%'; document.getElementById('xp-bar-fill').style.width = '0%';
        this.mat.emissive.setHex(0xffff00); setTimeout(() => this.mat.emissive.setHex(0x000000), 500);
    }
}
attack(targetList) {
    if (this.isAttacking || this.isDead) return; this.isAttacking = true; this.atkStart = Date.now();
    if (!this.isBot && !this.remoteId && socket) socket.emit('playerAttack');

    // Fix: Stop current momentum before lunging (Prevents Speed Hack)
    if (this.body) {
        this.body.velocity.x = 0; this.body.velocity.z = 0;
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        this.body.applyImpulse(new CANNON.Vec3(f.x * 15, 0, f.z * 15));
    }

    const range = this.weapon ? 4.0 : 2.5; const dmg = this.weapon ? 2.5 : 1; const knockback = this.weapon ? 60 : 30;
    if (targetList) {
        targetList.forEach(foe => {
            if (foe === this || foe.isDead) return;
            if (this.mesh.position.distanceTo(foe.mesh.position) < range) {
                const k = new THREE.Vector3().subVectors(foe.mesh.position, this.mesh.position).normalize();
                const force = new CANNON.Vec3(k.x * knockback, 10, k.z * knockback);

                // Local Hit
                if (!foe.remoteId) {
                    foe.takeHit(force, dmg);
                }
                // Remote Hit
                else if (socket) {
                    socket.emit('hitPlayer', { targetId: foe.remoteId, damage: dmg });
                }
            }
        });
    }
}
jump() {
    if (gameState !== 'playing') return; // Fix: No lobby flight
    if (this.body && Math.abs(this.body.velocity.y) < 0.1) { // Fix: Stricter jump check
        this.body.velocity.y = 8; // Slightly higher jump
    }
}
}

let player = null; const enemies = []; const weapons = []; const otherPlayers = {}; let socket = null;
const composer = new EffectComposer(renderer);
const godRaysEffect = new GodRaysEffect(camera, sunMesh, { resolutionScale: 0.5, density: 0.96, decay: 0.95, weight: 1.0, exposure: 1.0, samples: 60, clampMax: 1.0 });
const bloom = new BloomEffect({ intensity: 1.5, luminanceThreshold: 0.2, luminanceSmoothing: 0.8 });
const vignette = new VignetteEffect({ offset: 0.2, darkness: 0.6 });
composer.addPass(new RenderPass(scene, camera)); composer.addPass(new EffectPass(camera, new SMAAEffect(), godRaysEffect, bloom, vignette));

const joy = { x: 0, z: 0, on: false }, keys = {};
const jZ = document.getElementById('joystick-zone'), jN = document.getElementById('joystick-nipple'); let jC = { x: 0, y: 0 };
const mv = (cx, cy) => { const dx = cx - jC.x, dy = cy - jC.y, a = Math.atan2(dy, dx), d = Math.min(Math.sqrt(dx * dx + dy * dy), 40); jN.style.transform = `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px))`; joy.x = dx / 40; joy.z = dy / 40; };
jZ.addEventListener('touchstart', e => { joy.on = true; const r = document.getElementById('joystick-base').getBoundingClientRect(); jC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; mv(e.touches[0].clientX, e.touches[0].clientY); });
jZ.addEventListener('touchmove', e => { if (joy.on) mv(e.touches[0].clientX, e.touches[0].clientY); });
jZ.addEventListener('touchend', e => { joy.on = false; joy.x = 0; joy.z = 0; jN.style.transform = 'translate(-50%,-50%)'; });
jZ.addEventListener('mousedown', e => { joy.on = true; const r = document.getElementById('joystick-base').getBoundingClientRect(); jC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; mv(e.clientX, e.clientY); });
window.addEventListener('mousemove', e => { if (joy.on) mv(e.clientX, e.clientY); });
window.addEventListener('mouseup', e => { joy.on = false; joy.x = 0; joy.z = 0; jN.style.transform = 'translate(-50%,-50%)'; });

const bindBtn = (id, fn) => { const b = document.getElementById(id); if (b) { b.addEventListener('touchstart', e => { e.preventDefault(); fn() }); b.addEventListener('mousedown', e => { e.preventDefault(); fn() }); } }
bindBtn('btn-attack', () => player?.attack([...enemies, ...Object.values(otherPlayers)])); bindBtn('btn-jump', () => player?.jump());
window.addEventListener('keydown', e => {
    if (e.key === ' ') e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' && player) player.jump();
    if (e.key === 'k' && player) player.attack([...enemies, ...Object.values(otherPlayers)]);
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// === GAME STATE MANAGEMENT ===
let gameState = 'start'; // start, lobby, playing
let lobbyChar = null; // Character in lobby

// 1. START SCREEN
document.getElementById('btn-enter').addEventListener('click', () => {
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('lobby-screen').classList.add('active');
    gameState = 'lobby';

    // Create Preview Character
    lobbyChar = new Character('bear', false, { x: 0, z: 0 });
    lobbyChar.body.type = CANNON.Body.KINEMATIC; // No gravity
    lobbyChar.body.position.set(0, 0, 0); // Force ground position
    lobbyChar.mesh.position.set(0, 0, 0);
    player = lobbyChar;
});

// 2. LOBBY CONFIG
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const color = parseInt(e.target.dataset.color);
        if (lobbyChar) {
            lobbyChar.mat.color.setHex(color);
            lobbyChar.originalColor.setHex(color);
        }
    });
});

// 3. START MATCH
document.getElementById('btn-play').addEventListener('click', function (e) {
    this.blur(); // Remove focus to prevent Space from triggering this again

    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');

    gameState = 'playing';

    // Cleanup existing entities
    enemies.forEach(e => { scene.remove(e.mesh); world.removeBody(e.body); });
    weapons.forEach(w => { scene.remove(w.mesh); world.removeBody(w.body); });

    // Enable Physics on Player
    lobbyChar.body.type = CANNON.Body.DYNAMIC;
    lobbyChar.body.mass = 50;
    lobbyChar.body.updateMassProperties();
    lobbyChar.body.position.set(0, 1.5, 0); // Fix: Lower spawn height

    // Spawn Enemies & Weapons
    enemies.length = 0; // No bots for PvP
    weapons.length = 0; weapons.push(new Weapon('bat', 2, 2)); weapons.push(new Weapon('sword', -2, 0)); weapons.push(new Weapon('bat', 0, -4));

    // Socket
    try {
        if (!socket) {
            socket = io();
            socket.emit('joinGame', { x: 0, z: 0, type: 'bear', hp: 5 });
            socket.on('currentPlayers', (players) => { Object.keys(players).forEach(id => { if (id !== socket.id) addRemotePlayer(players[id]); }); });
            socket.on('newPlayer', (info) => addRemotePlayer(info));
            socket.on('playerMoved', (info) => { if (otherPlayers[info.id]) { otherPlayers[info.id].mesh.position.set(info.x, info.y || 0, info.z); } });
            socket.on('playerAttacked', (data) => { if (otherPlayers[data.id]) otherPlayers[data.id].attack(null); });
            socket.on('playerDisconnected', (id) => { if (otherPlayers[id]) { scene.remove(otherPlayers[id].mesh); delete otherPlayers[id]; } });

            socket.on('playerHit', (data) => {
                const target = data.id === socket.id ? player : otherPlayers[data.id];
                if (target) {
                    target.takeHit(new CANNON.Vec3(0, 10, 0), 0);
                    target.hp = data.hp;
                    if (target === player) document.getElementById('health-bar-fill').style.width = (target.hp / target.maxHp) * 100 + '%';
                }
            });

            socket.on('playerDied', (data) => {
                const target = data.id === socket.id ? player : otherPlayers[data.id];
                if (target) target.die();
            });
        }
    } catch (e) { }
});

function addRemotePlayer(info) { otherPlayers[info.id] = new Character(info.type, false, { x: info.x, z: info.z }, info.id); }

const clock = new THREE.Clock();
function loop() {
    requestAnimationFrame(loop);
    let dt = clock.getDelta();
    const t = clock.getElapsedTime();

    // Cap dt for mobile stability (prevents flying/tunneling)
    if (dt > 0.1) dt = 0.1;

    // CAMERA STATE MACHINE
    if (gameState === 'start') {
        // Orbit Arena
        camera.position.x = Math.sin(t * 0.2) * 50;
        camera.position.z = Math.cos(t * 0.2) * 50;
        camera.position.y = 30;
        camera.lookAt(0, 0, 0);
    } else if (gameState === 'lobby') {
        // Zoom on Player
        camera.position.lerp(new THREE.Vector3(0, 4, 8), 0.05); // Close up
        camera.lookAt(0, 2, 0);
        if (lobbyChar) {
            lobbyChar.mesh.rotation.y = t * 0.5;
            lobbyChar.update(dt, t); // Play Idle animations
        }
    } else if (gameState === 'playing') {
        // Game View
        if (player) {
            // Movement Variables
            const isGrounded = player.body.position.y < 1.0;
            const moveSpeed = isGrounded ? 12 : 6; // Less control in air

            // Apply Velocity (preserve Y for gravity)
            const currentY = player.body.velocity.y;
            world.step(1 / 60, dt, 3);

            let x = joy.x, z = joy.z;
            if (keys['w'] || keys['arrowup']) z = -1; if (keys['s'] || keys['arrowdown']) z = 1; if (keys['a'] || keys['arrowleft']) x = -1; if (keys['d'] || keys['arrowright']) x = 1;

            player.body.velocity.x = x * moveSpeed;
            player.body.velocity.z = z * moveSpeed;
            player.body.velocity.y = currentY;

            // Boundary Hard Limit (Arena Radius 20)
            const dist = Math.sqrt(player.body.position.x ** 2 + player.body.position.z ** 2);
            if (dist > 20) {
                const angle = Math.atan2(player.body.position.z, player.body.position.x);
                // Clamp Position
                player.body.position.x = Math.cos(angle) * 20;
                player.body.position.z = Math.sin(angle) * 20;

                // Kill Outward Velocity (Fixes vibration/sticking)
                const v = new THREE.Vector3(player.body.velocity.x, 0, player.body.velocity.z);
                const n = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)); // Normal pointing out
                const dot = v.dot(n);
                if (dot > 0) { // If moving out
                    player.body.velocity.x -= n.x * dot;
                    player.body.velocity.z -= n.z * dot;
                }
            }

            player.update(dt, t, null);

            // Camera Follow (Responsive Zoom)
            const isMobile = window.innerWidth < 800;
            const camY = isMobile ? 14 : 20;
            const camZ = isMobile ? 18 : 25;
            const targetPos = new THREE.Vector3(player.mesh.position.x, camY, player.mesh.position.z + camZ);
            camera.position.lerp(targetPos, 0.1);
            camera.lookAt(player.mesh.position);

            enemies.forEach(b => b.update(dt, t, player.body.position));
            weapons.forEach(w => w.update());
            if (socket) socket.emit('playerMovement', {
                x: player.mesh.position.x,
                y: player.mesh.position.y,
                z: player.mesh.position.z,
                rotation: player.mesh.rotation.y
            });
        }
    }

    composer.render();
    const el = document.getElementById('fps-counter'); if (el && clock.getElapsedTime() % 1 < 0.1) el.innerText = Math.round(1 / dt) + " FPS";
}

loop();
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
