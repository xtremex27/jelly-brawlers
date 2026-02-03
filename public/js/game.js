import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect, GodRaysEffect } from 'postprocessing';

// GLOBAL MOUSE FOR AIMING
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Ground plane for intersection
const mouseWorldPos = new THREE.Vector3();

// ... (Utils same as before) ...
// UTILS
const mats = {
    p: new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.8 }), // Player placeholder
    w: new THREE.MeshStandardMaterial({ color: 0xffffff, map: null }),      // Weapon placeholder
    g: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })  // Fallback ground
};


// SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Darker background
// scene.fog = new THREE.Fog(0x111111, 10, 50); // Optional fog for atmosphere

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 25, 25); camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// LIGHTING
const ambLight = new THREE.AmbientLight(0xffffff, 0.6); // Brighter Ambient
scene.add(ambLight);

const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5); // Sky/Ground tint
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -20; dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20; dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

// PHYSICS WORLD
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) });

// ENVIRONMENT (GLTF CITY)
// 1. Create a Fallback Visual Ground (So it's never just black)
const fbGeo = new THREE.PlaneGeometry(100, 100);
const fbMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const fallbackGround = new THREE.Mesh(fbGeo, fbMat);
fallbackGround.rotation.x = -Math.PI / 2;
fallbackGround.position.y = -1.05; // Slightly below GLTF floor
fallbackGround.receiveShadow = true;
scene.add(fallbackGround);

const envLoader = new GLTFLoader();
// Using direct RAW GitHub URL for better availability
envLoader.load(
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/Collision-world.glb',
    (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.5, 0.5, 0.5);
        model.position.y = -1;

        model.traverse(o => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
                if (o.material) o.material.side = THREE.DoubleSide;
            }
        });
        scene.add(model);
        console.log("Environment loaded successfully");
        // Optional: Hide fallback if success, or keep it as base
        // fallbackGround.visible = false; 
    },
    undefined, // onProgress
    (error) => {
        console.error("An error happened loading the environment:", error);
        // Fallback: Add some simple boxes if env fails
        const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), fbMat);
        box.position.set(5, 0, 5); scene.add(box);
    }
);

// PHYSICS (Invisible Ground Plane)
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), position: new CANNON.Vec3(0, -1, 0) });
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);


if (false) { // pillars.forEach(p => {
    // Visual
    const mesh = new THREE.Mesh(pillarGeo, pillarMat);
    mesh.position.set(p.x, 2, p.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    // Physics
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(1, 3, 1)), position: new CANNON.Vec3(p.x, 2, p.z) });
    world.addBody(body);
} // });

// GOD RAYS SOURCE
const sunGeo = new THREE.SphereGeometry(4, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.set(0, 20, -30);
scene.add(sunMesh);



// BULLETS
const bullets = [];
const bulletGeo = new THREE.SphereGeometry(0.2, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

class Bullet {
    constructor(x, y, z, vx, vz, ownerId) {
        this.mesh = new THREE.Mesh(bulletGeo, bulletMat);
        this.mesh.position.set(x, y, z);
        this.velocity = new THREE.Vector3(vx, 0, vz);
        this.ownerId = ownerId;
        this.life = 1.0; // Seconds to live
        scene.add(this.mesh);

        // Add glow light
        this.light = new THREE.PointLight(0xffff00, 1, 5);
        this.light.position.copy(this.mesh.position);
        scene.add(this.light);
    }

    update(dt) {
        this.life -= dt;
        this.mesh.position.addScaledVector(this.velocity, dt);
        this.light.position.copy(this.mesh.position);

        // Raycast for collision (simple distance check for now)
        // Check enemies
        // ... (Check logic in main loop for simplicity/performance)

        if (this.life <= 0) {
            this.destroy();
            return false;
        }
        return true;
    }

    destroy() {
        scene.remove(this.mesh);
        scene.remove(this.light);
    }
}

// WEAPON
class Weapon {
    constructor(type, x, z) {
        this.id = Math.random().toString(36).substr(2, 9); this.type = type; this.equippedBy = null;
        this.mesh = this.createWeaponMesh(type);
        this.mesh.position.set(x, 5, z);
        this.body = new CANNON.Body({ mass: 5, shape: new CANNON.Box(new CANNON.Vec3(0.1, 0.6, 0.1)), position: new CANNON.Vec3(x, 5, z), material: mats.w });
        this.mesh.castShadow = true; scene.add(this.mesh); world.addBody(this.body);
    }

    createWeaponMesh(type) {
        const g = new THREE.Group();

        if (type === 'gun') {
            // PISTOL
            const dark = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 });
            const silver = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 1.0 });

            // Grip
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), dark);
            grip.position.set(0, -0.1, 0);
            grip.rotation.x = 0.2;
            g.add(grip);

            // Frame/Barrel
            const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), silver);
            barrel.position.set(0, 0.1, 0.15);
            g.add(barrel);

            // Slide (Top)
            const slide = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.5), dark);
            slide.position.set(0, 0.16, 0.15);
            g.add(slide);

            // Trigger Guard
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.1), dark);
            guard.position.set(0, -0.05, 0.1);
            g.add(guard);
        }
        else if (type === 'sword') {
            // SWORD
            const steel = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1, metalness: 0.9 });
            const gold = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3, metalness: 0.6 });
            const leather = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.9 });

            // Blade
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.02), steel);
            blade.position.y = 0.6;
            g.add(blade);

            // Crossguard
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), gold);
            guard.position.y = 0.0;
            g.add(guard);

            // Hilt
            const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3), leather);
            hilt.position.y = -0.15;
            g.add(hilt);

            // Pommel
            const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06), gold);
            pommel.position.y = -0.3;
            g.add(pommel);
        }
        else { // bat
            // BAT
            const wood = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.6 });
            const tape = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

            // Bat body (Tape + Wood)
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.4), tape);
            handle.position.y = -0.3;
            g.add(handle);

            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 1.0), wood);
            body.position.y = 0.4;
            g.add(body);
        }

        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g;
    }
    update() {
        if (this.equippedBy) {
            // New GLTF Attachment Logic
            const charMesh = this.equippedBy.mesh;

            // Simple offset for right hand
            const handOffset = new THREE.Vector3(0.4, 0.8, 0.4);
            handOffset.applyQuaternion(charMesh.quaternion);

            this.mesh.position.copy(charMesh.position).add(handOffset);
            this.mesh.quaternion.copy(charMesh.quaternion);
            this.mesh.rotateX(Math.PI / 2);

            if (this.equippedBy.isAttacking) {
                // Procedural swing for melee
                if (this.type !== 'gun') {
                    this.mesh.rotation.x -= 1.0;
                    this.mesh.position.y -= 0.5;
                }
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

        // MIXER & ANIMATIONS
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.isLoaded = false;

        // Load GLTF
        const loader = new GLTFLoader();
        // Using Three.js Example Soldier Model
        loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

            // Scaling to fit physics body
            model.scale.set(1.5, 1.5, 1.5);
            model.position.y = -0.5; // Offset to feet
            model.rotation.y = Math.PI; // Face forward

            this.mesh.add(model);

            // Animations
            this.mixer = new THREE.AnimationMixer(model);
            const anims = gltf.animations;

            // Map Animations (Soldier has: Idle, Run, TPose, Walk)
            this.actions['Idle'] = this.mixer.clipAction(anims.find(a => a.name === 'Idle'));
            this.actions['Run'] = this.mixer.clipAction(anims.find(a => a.name === 'Run'));
            this.actions['TPose'] = this.mixer.clipAction(anims.find(a => a.name === 'TPose'));

            // Start Idle
            this.transitionTo('Idle');
            this.isLoaded = true;
        });

        if (!remoteId) {
            this.bodyRadius = 0.5;
            this.body = new CANNON.Body({ mass: 50, shape: new CANNON.Sphere(this.bodyRadius), position: new CANNON.Vec3(startPos.x, 5, startPos.z), material: mats.p, linearDamping: 0.1, angularDamping: 1.0, fixedRotation: true });
            world.addBody(this.body);

            // Collision-based Ground Detection
            this.canJump = false;
            this.body.addEventListener('collide', (e) => {
                const contactNormal = new CANNON.Vec3();
                e.contact.ni.copy(contactNormal);
                if (Math.abs(contactNormal.dot(new CANNON.Vec3(0, 1, 0))) > 0.5) {
                    this.canJump = true;
                }
            });

        } else { this.mesh.position.set(startPos.x, 0, startPos.z); }
        scene.add(this.mesh);
        this.atkStart = 0; this.isAttacking = false; this.originalColor = new THREE.Color(this.colorVal);
    }

    transitionTo(name) {
        if (!this.actions[name]) return;
        const next = this.actions[name];
        if (this.activeAction === next) return;

        if (this.activeAction) {
            this.activeAction.fadeOut(0.2);
        }
        next.reset().fadeIn(0.2).play();
        this.activeAction = next;
    }

    update(dt, time, playerTarget) {
        if (this.isDead) return;

        // MIXER UPDATE
        if (this.mixer) this.mixer.update(dt);

        // SYNC PHYSICS
        if (!this.remoteId && this.body) this.mesh.position.copy(this.body.position);

        // Fix: Velocity Cap (Anti-Speed Hack)
        const maxSpeed = 20;
        if (this.body && this.body.velocity.length() > maxSpeed) {
            const v = this.body.velocity;
            v.scale(maxSpeed / v.length(), v);
        }

        let inputX = joy.x, inputZ = joy.z;
        if (keys['w'] || keys['arrowup']) inputZ = -1; if (keys['s'] || keys['arrowdown']) inputZ = 1; if (keys['a'] || keys['arrowleft']) inputX = -1; if (keys['d'] || keys['arrowright']) inputX = 1;

        // Joystick normalization
        const len = Math.sqrt(inputX ** 2 + inputZ ** 2);
        if (len > 1.0) { inputX /= len; inputZ /= len; }

        if (this.isBot) {
            const dx = playerTarget.x - this.body.position.x, dz = playerTarget.z - this.body.position.z; const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 15 && dist > 1.1) { inputX = dx / dist; inputZ = dz / dist; }
            this.body.velocity.x = inputX * 3.5; this.body.velocity.z = inputZ * 3.5;
        }
        else if (!this.remoteId && gameState === 'playing') {
            const moveSpeed = 12; // Static PC/Mobile Speed
            this.body.velocity.x = inputX * moveSpeed;
            this.body.velocity.z = inputZ * moveSpeed;
        }

        let speed = 0;
        if (!this.remoteId) { const v = this.body.velocity; speed = Math.sqrt(v.x ** 2 + v.z ** 2); } else { speed = 5; }

        // Animation State Logic
        if (this.isLoaded) {
            let targetAnim = 'Idle';

            if (speed > 1.0) {
                targetAnim = 'Run';
            }

            if (this.weapon && this.weapon.type === 'gun') {
                if (targetAnim === 'Idle') targetAnim = 'TPose';
            }

            this.transitionTo(targetAnim);
        }

        if (gameState === 'playing' && !this.isBot && !this.remoteId) {
            // Gun Aiming
            if (this.weapon && this.weapon.type === 'gun') {
                if (!joy.on) {
                    // PC: Face Mouse
                    this.mesh.lookAt(mouseWorldPos.x, this.mesh.position.y, mouseWorldPos.z);
                }
            }

            // Movement Rotation
            if (speed > 0.5) {
                if (!this.weapon || this.weapon.type !== 'gun' || joy.on) {
                    const v = this.body.velocity; const angle = Math.atan2(v.x, v.z);
                    this.mesh.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), 0.2);
                }
            }
        }
    }

    takeHit(forceVec, dmg = 1) {
        if (this.isDead || this.remoteId) return; this.hp -= dmg;
        // Flash effect (might fail if material is complex gltf, but try/catch or simple check needed? 
        // GLTF materials are usually Standard, so emissive works.
        // We'll skip complex flash for now to avoid crashes or traverse model.

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
        }
    }

    attack(targetList) {
        if (this.isAttacking || this.isDead) return; this.isAttacking = true; this.atkStart = Date.now();
        if (!this.isBot && !this.remoteId && socket) socket.emit('playerAttack');

        if (this.weapon && this.weapon.type === 'gun') {
            const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion).normalize();
            const bSpeed = 30;
            // Spawn relative to character center
            const spawnX = this.mesh.position.x + dir.x * 1;
            const spawnY = this.mesh.position.y + 1.5; // Higher for soldier model
            const spawnZ = this.mesh.position.z + dir.z * 1;

            const b = new Bullet(spawnX, spawnY, spawnZ, dir.x * bSpeed, dir.z * bSpeed, this.remoteId || 'player');
            bullets.push(b);

            if (socket) socket.emit('shoot', {
                x: spawnX, y: spawnY, z: spawnZ,
                vx: b.velocity.x, vz: b.velocity.z
            });

            this.isAttacking = false;
            return;
        }

        // Melee Lunge
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
                    if (!foe.remoteId) {
                        foe.takeHit(force, dmg);
                    }
                    else if (socket) {
                        socket.emit('hitPlayer', { targetId: foe.remoteId, damage: dmg });
                    }
                }
            });
        }
    }

    jump() {
        if (gameState !== 'playing') return;
        if (this.canJump) {
            this.body.velocity.y = 8;
            this.canJump = false;
        }
    }
}

let player = null; const enemies = []; const weapons = []; const otherPlayers = {}; let socket = null;
const composer = new EffectComposer(renderer);
const godRaysEffect = new GodRaysEffect(camera, sunMesh, { resolutionScale: 0.5, density: 0.96, decay: 0.95, weight: 1.0, exposure: 1.0, samples: 60, clampMax: 1.0 });
const bloom = new BloomEffect({ intensity: 1.5, luminanceThreshold: 0.2, luminanceSmoothing: 0.8 });
const vignette = new VignetteEffect({ offset: 0.2, darkness: 0.6 });
composer.addPass(new RenderPass(scene, camera)); composer.addPass(new EffectPass(camera, new SMAAEffect(), godRaysEffect, bloom, vignette));

const joy = { x: 0, z: 0, id: null }, keys = {};
const jZ = document.getElementById('joystick-zone'), jN = document.getElementById('joystick-nipple'); let jC = { x: 0, y: 0 };
const mv = (cx, cy) => {
    const dx = cx - jC.x, dy = cy - jC.y;
    const a = Math.atan2(dy, dx);
    const d = Math.min(Math.sqrt(dx * dx + dy * dy), 40);
    jN.style.transform = `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px))`;
    const force = d / 40; joy.x = Math.cos(a) * force; joy.z = Math.sin(a) * force;
};

jZ.addEventListener('touchstart', e => {
    if (joy.id !== null) return; // Already touching
    const t = e.changedTouches[0];
    joy.id = t.identifier;
    joy.on = true;
    const r = document.getElementById('joystick-base').getBoundingClientRect();
    jC = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    mv(t.clientX, t.clientY);
});
jZ.addEventListener('touchmove', e => {
    if (joy.id === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joy.id) {
            mv(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
        }
    }
});
jZ.addEventListener('touchend', e => {
    if (joy.id === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joy.id) {
            joy.id = null; joy.on = false; joy.x = 0; joy.z = 0;
            jN.style.transform = 'translate(-50%,-50%)';
            break;
        }
    }
});
// Mouse fallback
jZ.addEventListener('mousedown', e => { joy.on = true; const r = document.getElementById('joystick-base').getBoundingClientRect(); jC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; mv(e.clientX, e.clientY); });
window.addEventListener('mousemove', e => { if (joy.on) mv(e.clientX, e.clientY); });
window.addEventListener('mouseup', e => { if (joy.on) { joy.on = false; joy.x = 0; joy.z = 0; jN.style.transform = 'translate(-50%,-50%)'; } });

const bindBtn = (id, fn) => { const b = document.getElementById(id); if (b) { b.addEventListener('touchstart', e => { e.preventDefault(); fn() }); b.addEventListener('mousedown', e => { e.preventDefault(); fn() }); } }
bindBtn('btn-attack', () => player?.attack([...enemies, ...Object.values(otherPlayers)])); bindBtn('btn-jump', () => player?.jump());

window.addEventListener('mousemove', e => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
window.addEventListener('mousedown', e => {
    if (gameState === 'playing' && player && player.weapon && player.weapon.type === 'gun') {
        player.attack();
    }
});

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
    weapons.length = 0;
    weapons.push(new Weapon('bat', 2, 2));
    weapons.push(new Weapon('sword', -2, 0));
    weapons.push(new Weapon('gun', 0, -4)); // Added gun

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

            socket.on('shoot', (data) => {
                const b = new Bullet(data.x, data.y, data.z, data.vx, data.vz, data.attackerId);
                bullets.push(b);
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

            // Update Bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                const b = bullets[i];
                if (!b.update(dt)) {
                    bullets.splice(i, 1);
                    continue;
                }

                // Bullet collision check (Only owner checks to avoid double hits)
                if (b.ownerId === (socket ? socket.id : 'player')) {
                    const targets = [...enemies, ...Object.values(otherPlayers)];
                    for (const target of targets) {
                        if (target.remoteId === b.ownerId || target.isDead) continue;
                        if (b.mesh.position.distanceTo(target.mesh.position) < 0.8) {
                            // Hit!
                            const force = new CANNON.Vec3(b.velocity.x * 0.5, 5, b.velocity.z * 0.5);
                            target.takeHit(force, 2); // 2 Damage for gun
                            if (socket && target.remoteId) {
                                socket.emit('hitPlayer', { targetId: target.remoteId, damage: 2 });
                            }
                            b.destroy();
                            bullets.splice(i, 1);
                            break;
                        }
                    }
                }
            }

            if (socket) socket.emit('playerMovement', {
                x: player.mesh.position.x,
                y: player.mesh.position.y,
                z: player.mesh.position.z,
                rotation: player.mesh.rotation.y
            });
        }

        // Raycast for Mouse aiming
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ground); // Simple ground check
        if (intersects.length > 0) {
            mouseWorldPos.copy(intersects[0].point);
        } else {
            // Fallback if off ground (raycast against abstract plane)
            raycaster.ray.intersectPlane(plane, mouseWorldPos);
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
