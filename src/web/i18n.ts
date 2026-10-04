import type { Language } from "../shared/language";

const en = {
  composerLabel: "ASK SOUS", send: "Send", stop: "Stop", listeningPlaceholder: "Listening…", voiceRecovery: "Voice interrupted. Type or try again.",
  oneThing: "ONE THING AT A TIME.", companion: "Sous cooking companion", returnSession: "Sous — return to your cooking session",
  kitchenCompanion: "YOUR KITCHEN COMPANION", makeGood: "LET’S MAKE SOMETHING GOOD.", journey: "Cooking journey",
  ingredients: "Ingredients", proposal: "Proposal", cooking: "Cooking", complete: "Complete",
  opening: "Opening the kitchen", finding: "Finding a dish", preparing: "Preparing your cooking plan", thinkingChange: "Thinking through your change", updating: "Updating the kitchen",
  currentNotice: "Current step shown. Complete it when you’re ready.", startAgain: "Start again →",
  entryLabel: "01 / INGREDIENTS", whatDo: "WHAT DO", youHave: "YOU HAVE?", introOne: "A few ingredients. A dish worth making.", introTwo: "Tell Sous what’s in your kitchen.", counter: "ON YOUR COUNTER", ingredientsPlaceholder: "Pasta, tomatoes, garlic, parmesan…", findDish: "Find something to cook",
  startWith: "Start with", whatYouHave: "what you have.", includeQuantities: "Include any quantities, how many people you’re cooking for, and anything you’d like to avoid.", takesYou: "Sous takes you from ingredients to the last step. You can ask for changes as you cook.",
  proposalLabel: "02 / PROPOSAL", soundGood: "Sound good? Sous will prepare the steps, then we’ll cook one at a time.", estimated: "MINUTES / ESTIMATED", servingsLabel: "SERVINGS",
  step: "STEP", of: "of", doNow: "DO THIS NOW", inKitchen: "IN THE KITCHEN", forStep: "FOR THIS STEP", updated: "PLAN UPDATED", question: "A QUICK QUESTION", fromSous: "FROM SOUS", upNext: "UP NEXT", lastStep: "LAST STEP", timeToEat: "Then it’s time to eat.", fullIngredients: "Full recipe ingredients", fullRecipe: "FULL RECIPE", startOver: "Start over",
  stepsComplete: "STEPS COMPLETE", toThe: "TO THE", table: "TABLE.", enjoy: "All steps complete. Enjoy what you’ve made.", mealComplete: "All steps are complete. Enjoy your meal!",
  working: "WORKING", atPace: "AT YOUR PACE", doneNext: "Done · next", questionPlaceholder: "Ask about this step or change something…", compactQuestionPlaceholder: "Ask about this step…",
  listening: "LISTENING", transcribing: "TRANSCRIBING", thinking: "THINKING", speaking: "SPEAKING", error: "ERROR", finishSend: "Finish & send →", finishCapture: "Finish recording", cancel: "Cancel", stopSpeech: "Stop speech", speak: "Speak",
  nextDish: "YOUR INGREDIENTS. YOUR NEXT DISH.", preparingPlan: "Preparing the plan…", letsCook: "Let’s cook", kitchenYours: "THE KITCHEN IS YOURS.", cookElse: "Cook something else", oneDish: "SOUS / ONE DISH, FROM START TO FINISH.", madeKitchen: "MADE FOR THE KITCHEN.",
  language: "Language", languageBefore: "Choose a language before starting a recipe.", languageLocked: "Start over to change language.",
  incomplete: "That request is incomplete. Please try again.", busyError: "Sous is still working. Wait for the response, then try again.", unavailable: "Sous cannot connect to the cooking service right now. Please try again later.", invalidResponse: "Sous could not use that response. Your cooking state is unchanged. Please retry or clarify your request.", modelError: "Sous could not get a cooking response. Your cooking state is unchanged. Please try again.", missing: "This cooking session is no longer available. Start again with your ingredients.", stale: "That action does not match the current cooking step. The latest state is shown; please try again.", origin: "Please send this request from Sous.", unreadable: "That request could not be read. Please try again.", openError: "Sous could not open the kitchen. Please try again.", connection: "The connection was interrupted. Check the current step before retrying your request.",
  voiceOrigin: "Please use voice from Sous.", voiceStart: "Start cooking before using voice.", voicePreparing: "Voice is already preparing. Please wait.", voiceUnavailable: "Voice is unavailable. Use text or the cooking buttons.", speechUnreadable: "That speech request could not be read.", speechIncomplete: "That speech request is incomplete.", kitchenChanged: "The kitchen has changed. Check the current step.", speechPreparing: "Speech is already preparing. Please wait.", speechUnavailable: "Speech is unavailable. Your cooking response is still shown.", microphoneUnavailable: "Microphone unavailable. Allow access in your browser, or type your text.", playbackFailed: "Could not play speech. Your cooking response is still shown. Use text or try Speak again.", voiceAgentFailed: "Could not finish the cooking request. Check the current step before retrying.", captureFailed: "Microphone capture failed. Type your text or try Speak again.", transcriptionFailed: "Could not transcribe that recording. Type your text or try Speak again.",
};
export type CopyKey = keyof typeof en;
export type Copy = { [K in CopyKey]: string };
const pl: Copy = {
  composerLabel: "ZAPYTAJ SOUS", send: "Wyślij", stop: "Stop", listeningPlaceholder: "Słucham…", voiceRecovery: "Głos przerwany. Napisz lub spróbuj ponownie.",
  oneThing: "JEDNO PO DRUGIM.", companion: "Sous — pomoc w gotowaniu", returnSession: "Sous — wróć do gotowania",
  kitchenCompanion: "TWÓJ POMOCNIK W KUCHNI", makeGood: "UGOTUJMY COŚ DOBREGO.", journey: "Etapy gotowania",
  ingredients: "Składniki", proposal: "Propozycja", cooking: "Gotowanie", complete: "Gotowe",
  opening: "Otwieram kuchnię", finding: "Szukam pomysłu na danie", preparing: "Przygotowuję plan gotowania", thinkingChange: "Rozważam zmianę", updating: "Aktualizuję plan",
  currentNotice: "Pokazuję bieżący krok. Oznacz go jako gotowy, gdy skończysz.", startAgain: "Zacznij od nowa →",
  entryLabel: "01 / SKŁADNIKI", whatDo: "CO MASZ", youHave: "W KUCHNI?", introOne: "Kilka składników. Pomysł na dobre danie.", introTwo: "Powiedz Sous, co masz w kuchni.", counter: "NA TWOIM BLACIE", ingredientsPlaceholder: "Makaron, pomidory, czosnek, parmezan…", findDish: "Znajdź pomysł na danie",
  startWith: "Zacznij od tego,", whatYouHave: "co masz.", includeQuantities: "Podaj ilości, liczbę osób, dla których gotujesz, i składniki, których chcesz unikać.", takesYou: "Sous prowadzi od składników do ostatniego kroku. W trakcie gotowania możesz poprosić o zmiany.",
  proposalLabel: "02 / PROPOZYCJA", soundGood: "Brzmi dobrze? Sous przygotuje przepis, a potem przejdziemy przez niego krok po kroku.", estimated: "MINUT / ORIENTACYJNIE", servingsLabel: "PORCJE",
  step: "KROK", of: "z", doNow: "ZRÓB TO TERAZ", inKitchen: "W KUCHNI", forStep: "DO TEGO KROKU", updated: "PLAN ZAKTUALIZOWANY", question: "KRÓTKIE PYTANIE", fromSous: "OD SOUS", upNext: "NASTĘPNIE", lastStep: "OSTATNI KROK", timeToEat: "Potem czas na jedzenie.", fullIngredients: "Wszystkie składniki przepisu", fullRecipe: "CAŁY PRZEPIS", startOver: "Zacznij od nowa",
  stepsComplete: "UKOŃCZONE KROKI", toThe: "DO", table: "STOŁU.", enjoy: "Wszystkie kroki gotowe. Smacznego!", mealComplete: "Wszystkie kroki są gotowe. Smacznego!",
  working: "PRACUJĘ", atPace: "W TWOIM TEMPIE", doneNext: "Gotowe · dalej", questionPlaceholder: "Zapytaj o ten krok lub zmień coś…", compactQuestionPlaceholder: "Zapytaj o ten krok…",
  listening: "SŁUCHAM", transcribing: "ROZPOZNAJĘ MOWĘ", thinking: "MYŚLĘ", speaking: "MÓWIĘ", error: "BŁĄD", finishSend: "Zakończ i wyślij →", finishCapture: "Zakończ nagrywanie", cancel: "Anuluj", stopSpeech: "Zatrzymaj mowę", speak: "Mów",
  nextDish: "TWOJE SKŁADNIKI. TWOJE NASTĘPNE DANIE.", preparingPlan: "Przygotowuję plan…", letsCook: "Gotujmy", kitchenYours: "KUCHNIA JEST TWOJA.", cookElse: "Ugotuj coś innego", oneDish: "SOUS / JEDNO DANIE, OD POCZĄTKU DO KOŃCA.", madeKitchen: "Z MYŚLĄ O KUCHNI.",
  language: "Język", languageBefore: "Wybierz język przed rozpoczęciem przepisu.", languageLocked: "Zacznij od nowa, aby zmienić język.",
  incomplete: "Ta prośba jest niekompletna. Spróbuj ponownie.", busyError: "Sous jeszcze pracuje. Poczekaj na odpowiedź i spróbuj ponownie.", unavailable: "Sous nie może teraz połączyć się z usługą gotowania. Spróbuj później.", invalidResponse: "Sous nie mógł wykorzystać odpowiedzi. Stan gotowania pozostaje bez zmian. Spróbuj ponownie lub doprecyzuj prośbę.", modelError: "Sous nie mógł uzyskać odpowiedzi. Stan gotowania pozostaje bez zmian. Spróbuj ponownie.", missing: "Ta sesja gotowania nie jest już dostępna. Zacznij od nowa i podaj składniki.", stale: "Ta czynność nie pasuje do bieżącego kroku. Pokazuję aktualny stan; spróbuj ponownie.", origin: "Wyślij tę prośbę z aplikacji Sous.", unreadable: "Nie udało się odczytać prośby. Spróbuj ponownie.", openError: "Sous nie mógł otworzyć kuchni. Spróbuj ponownie.", connection: "Połączenie zostało przerwane. Sprawdź bieżący krok, zanim ponowisz prośbę.",
  voiceOrigin: "Korzystaj z głosu w aplikacji Sous.", voiceStart: "Rozpocznij gotowanie, aby korzystać z głosu.", voicePreparing: "Głos jest już przygotowywany. Poczekaj.", voiceUnavailable: "Głos jest niedostępny. Użyj tekstu lub przycisków gotowania.", speechUnreadable: "Nie udało się odczytać prośby o mowę.", speechIncomplete: "Prośba o mowę jest niekompletna.", kitchenChanged: "Plan się zmienił. Sprawdź bieżący krok.", speechPreparing: "Mowa jest już przygotowywana. Poczekaj.", speechUnavailable: "Mowa jest niedostępna. Odpowiedź nadal jest widoczna.", microphoneUnavailable: "Mikrofon jest niedostępny. Zezwól na dostęp w przeglądarce lub wpisz tekst.", playbackFailed: "Nie udało się odtworzyć mowy. Odpowiedź nadal jest widoczna. Użyj tekstu lub ponownie naciśnij Mów.", voiceAgentFailed: "Nie udało się wykonać prośby. Sprawdź bieżący krok, zanim spróbujesz ponownie.", captureFailed: "Nie udało się nagrać głosu. Wpisz tekst lub ponownie naciśnij Mów.", transcriptionFailed: "Nie udało się rozpoznać nagrania. Wpisz tekst lub ponownie naciśnij Mów.",
};
export const copy: Record<Language, Copy> = { en, pl };
export function servings(count: number, language: Language): string {
  return language === "en" ? `${count} servings` : `${count} ${polishForm(count, ["porcja", "porcje", "porcji"])}`;
}
export function stepsCompleted(count: number, language: Language): string {
  return language === "en" ? `${count} steps completed` : `${count} ${polishForm(count, ["krok ukończony", "kroki ukończone", "kroków ukończonych"])}`;
}
export function polishForm(count: number, forms: readonly [string, string, string]): string {
  const category = new Intl.PluralRules("pl").select(count);
  return forms[category === "one" ? 0 : category === "few" ? 1 : 2];
}

export function servingsLabel(count: number, language: Language): string {
  return language === "en" ? copy.en.servingsLabel : polishForm(count, ["porcja", "porcje", "porcji"]).toUpperCase();
}
