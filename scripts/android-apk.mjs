/**
 * Construit l'APK de débogage : build web, copie dans le projet Android, Gradle.
 *
 *   npm run android:apk
 *
 * Capacitor 7 demande un JDK 21. Le JDK pris est, dans l'ordre : JAVA21_HOME,
 * le plus récent des JDK 21 de ~/.jdks (installés par IntelliJ), puis JAVA_HOME.
 * L'APK est écrit dans android/app/build/outputs/apk/debug/app-debug.apk.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function jdk21() {
  if (process.env.JAVA21_HOME) return process.env.JAVA21_HOME;
  const dir = path.join(os.homedir(), '.jdks');
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /-21[.\d]*$/.test(d)).sort() : [];
  return found.length ? path.join(dir, found[found.length - 1]) : process.env.JAVA_HOME;
}

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const javaHome = jdk21();
if (!javaHome) throw new Error('Aucun JDK 21 trouvé : définir JAVA21_HOME.');
console.log(`JDK : ${javaHome}`);

run('npm run build');
run('npx cap sync android');
const gradlew = `"${path.resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}"`;
run(`${gradlew} assembleDebug --console=plain "-Dorg.gradle.java.home=${javaHome}"`, {
  cwd: 'android',
  env: { ...process.env, JAVA_HOME: javaHome },
});
console.log('\nAPK : android/app/build/outputs/apk/debug/app-debug.apk');
