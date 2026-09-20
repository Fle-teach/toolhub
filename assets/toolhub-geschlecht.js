/*
 * toolhub-geschlecht.js – Geschlecht aus dem Vornamen schätzen.
 *
 * Einbindung (Tool-Seiten, zwei Ebenen unter dem Root):
 *   <script src="../../assets/toolhub-geschlecht.js" defer></script>
 *
 * Enthält:
 *   toolhubGeschlechtNormalisieren(wert)   Spaltenwert -> 'm' | 'w' | null
 *   toolhubGeschlechtRaten(vorname)        Vorname   -> { geschlecht, sicherheit }
 *   toolhubGeschlechtMerken(vorname, g)    manuelle Korrektur dauerhaft merken
 *   toolhubGeschlechtZeichen(g)            'm' -> '♂', 'w' -> '♀'
 *
 * Bewusst ein lokales Wörterbuch und keine Online-Abfrage: Die Tools müssen ohne
 * Internetzugang laufen, und Schülernamen verlassen den Browser nicht.
 *
 * Die Schätzung ist eine Vorbelegung, keine Auskunft: Jedes Tool zeigt das Ergebnis
 * zur Durchsicht an, bevor damit gerechnet wird. Eine vorhandene Angabe aus der
 * Quelldatei hat immer Vorrang – geraten wird nur, wo nichts dasteht.
 */

/* ---------------------------------------------------------------------------
 * Vorhandene Angaben aus einer Spalte deuten
 * ------------------------------------------------------------------------ */

/*
 * Schulische Quellsysteme schreiben das Geschlecht sehr unterschiedlich: "m"/"w",
 * "männlich"/"weiblich", "M"/"F" (englische Exporte), gelegentlich "1"/"2" (DiViS).
 * Alles andere – auch "d" und "divers" – gilt als *keine* Angabe: Es wird nicht
 * geraten und das Kind aus geschlechtsbezogenen Mustern herausgehalten, statt es
 * in eine der beiden Schubladen zu zwingen.
 */
function toolhubGeschlechtNormalisieren(wert) {
  const text = String(wert ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/^(m|mä|maennlich|männlich|male|junge|j|1)$/.test(text)) return 'm';
  if (/^(w|f|weiblich|female|mädchen|maedchen|girl|2)$/.test(text)) return 'w';
  return null;
}

function toolhubGeschlechtZeichen(geschlecht) {
  return geschlecht === 'm' ? '♂' : geschlecht === 'w' ? '♀' : '';
}

/* ---------------------------------------------------------------------------
 * Wörterbuch
 *
 * Zusammengestellt nach den Vornamen, die in niedersächsischen Schuljahrgängen
 * tatsächlich vorkommen: deutsche Namen der letzten Jahrzehnte (auch die der
 * Lehrkräfte- und Elterngeneration) sowie häufige türkische, arabische, polnische,
 * russische, südosteuropäische, italienische und englische Namen.
 * ------------------------------------------------------------------------ */

const TOOLHUB_VORNAMEN_M = `
Aaron Abdullah Abdul Achim Adam Adem Adrian Adriano Ahmad Ahmed Ahmet Akin Alan Albert Albin
Aleksandar Aleksander Alessandro Alessio Alexander Alexandros Alfons Alfred Ali Alois Alp Alparslan
Alvaro Amar Amin Amir Anas Anatol Anders Andre André Andreas Andrej Andrew Andrzej Angelo Ansgar
Anton Antonio Antonius Arda Arian Aris Arjan Armin Arne Arno Arnold Arsen Artem Arthur Artur Ata
Atilla Attila August Augustin Aurel Axel Ayaz Ayhan Aykut Ayman Azad
Bahri Baran Barnabas Bartosz Bastian Batuhan Ben Benedikt Bennet Bennett Benjamin Benno Berat Berk Berkay Bernd
Bernhard Bertram Bilal Birk Bjarne Björn Bogdan Boris Brandon Bruno Burak Burkhard
Carl Caspar Casper Cedric Cedrik Cem Cengiz Christian Christoph Christopher Claas Claudio Clemens Colin
Collin Conrad Constantin Cornelius Cristian Curt
Damian Damien Damir Daniel Danilo Danny Dario Darius Darko David Davide Davud Dean Deniz Denis
Dennis Diego Dieter Dimitri Dirk Dmitri Domenico Dominic Dominik Donat Dorian Dragan Dustin Dylan
Eberhard Edgar Edin Edis Edmund Eduard Edward Efe Egon Ehsan Elia Elias Eliah Elijah Elmar Elvin
Elvis Emanuel Emil Emilio Emin Emir Emre Enes Engin Enno Enrico Enzo Eren Erdal Erdem Erhard Erich
Erik Ernst Erol Ersin Ervin Erwin Esat Eugen Evan Ewald Ezra
Fabian Fabio Fabrice Falk Falko Farhad Faruk Fatih Felix Ferdinand Ferhat Fiete Filip Filippo Finn
Finnley Florentin Florian Francesco Franco Frank Franz Fred Frederic Frederick Frederik Friedemann
Friedhelm Friedrich Fritz Furkan Fynn
Gabor Gabriel Gennaro Georg George Georgios Gerald Gerd Gerhard Gernot Gero Gert Giacomo Gian
Gianluca Gilbert Gino Giovanni Giuliano Giuseppe Glenn Gökhan Gordon Gottfried Gregor Gregory Guido
Gunnar Günter Günther Gustav
Hakan Halil Hamza Hannes Hanno Hans Harald Hardy Hartmut Harun Hasan Hassan Hauke Heiko Heinrich
Heinz Helge Helmut Hendrik Henning Henri Henrik Henry Herbert Hermann Hilmar Holger Horst Hubert
Hugo Hüseyin
Ian Ibrahim Igor Ilias Ilja Ilyas Immanuel Ingo Ismail Ivan Ivo Iwan
Jack Jacob Jakob Jakub Jamal James Jan Janek Janis Janne Jannes Jannik Jannis Janosch Jared Jarne
Jaron Jasin Jasper Jean Jens Jeremias Jeremy Jerome Jesko Jesse Jim Joachim Joel Johann Johannes
John Jon Jona Jonah Jonas Jonathan Joost Jordan Jorge Jörg Jörn Jose Josef Joseph Joshua Josua Juan
Julian Julius Jürgen Justin Justus
Kaan Kai Kamil Karim Karl Kasimir Kaspar Kemal Kenan Kenneth Kerem Kerim Kevin Khalil Kian Kilian
Kirill Klaas Klaus Konstantin Koray Korbinian Krzysztof Kuno Kurt
Lars Lasse Laurens Laurent Laurenz Laurin Lazar Leander Leandro Lee Lenn Lennard Lennart Lennox Leo
Leon Leonard Leonardo Leonhard Leonid Leopold Levent Levi Levin Lewin Lewis Liam Lian Lino Linus Lio
Lion Lionel Livio Lorenz Lorenzo Louis Luan Lucas Lucian Ludwig Luigi Luis Luiz Lukas Lutz
Maarten Maciej Magnus Mahmud Mahmut Maik Maksim Malik Malte Manfred Manuel Marc Marcel Marco Marcus
Marek Mario Marius Mark Marko Markus Marlo Marlon Marten Martin Mats Marvin Mattis Mateo Mateusz Mathias Mathis
Matis Matteo Mattes Mattheo Matthes Matthias Matthis Matti Mattias Maurice Mauricio Mauritz Max Maxi
Maxim Maximilian Maximus Mehmet Meik Melvin Merlin Mert Metin Micha Michael Michel Miguel Mihail Mikael Mike
Mikkel Milan Milo Mirco Mirko Miro Mirza Mohamed Mohammad Mohammed Moritz Mouhamed Muhammed Murat
Mustafa
Nathan Nathanael Nedim Nelson Neo Neven Nick Niclas Nicholas Nico Nicolas Niels Niklas Niko Nikolai
Nikolas Nils Nino Noah Noel Nolan Norbert Norman Nurettin
Oguz Okan Olaf Ole Oleg Oliver Omar Omer Onur Orhan Oscar Oskar Osman Oswald Otto Ottokar Ozan
Pablo Paolo Pascal Patrick Paul Pavel Pawel Pepe Per Peter Petr Philip Philipp Philippe Phillip
Pierre Pieter Pietro Piotr Pit Pius
Quentin Quirin
Radek Rafael Raffael Rainer Ralf Ralph Ramon Raphael Rasmus Rayan Recep Reinhard Reinhold Remo Rene
René Ricardo Riccardo Richard Rico Rik Rinaldo Robert Rocco Rodrigo Roger Roland Rolf Roman Ronald
Ronny Rouven Ruben Rudi Rudolf Rüdiger Rune Ryan
Said Salih Salvatore Sami Samir Sammy Samuel Sandro Santino Sebastian Selim Semih Serdar Serkan
Servet Severin Sevket Siegfried Sigmund Silas Silvan Silvio Simeon Simon Sinan Soner Sönke Sonny
Stefan Steffen Stephan Steve Steven Sven Sylvester Szymon
Taha Tahir Talha Thaddäus Tamino Tamme Tarek Tarik Tayfun Taylan Teo Theo Theodor Thies Thilo Thomas Thorben
Thore Thorsten Till Tilman Tim Timm Timo Timon Timur Til Tino Titus Tizian Tjark Tobias Tobit Tom Tomas
Tommy Torben Tore Torsten Tristan Tuan Tugay Tunay Turan
Ugur Ulf Ulrich Umut Urs Uwe
Valentin Valentino Vasil Veit Victor Viktor Vincent Vinzenz Vitali Vito Vladimir Volkan Volker
Waldemar Walter Werner Wilhelm Willi William Willy Wim Winfried Wladimir Wolf Wolfgang Wolfram
Xaver Xavier
Yannic Yannick Yannik Yannis Yasin Yavuz Yigit Younes Yousef Yusuf Yves
Zacharias Zachary Zeki Zeno Ziad Zoran
`.split(/\s+/).filter(Boolean);

const TOOLHUB_VORNAMEN_W = `
Aaliyah Abigail Ada Adele Adelheid Adriana Adrienne Agata Agnes Aida Aileen Aisha Aitana Alanna Alea
Alejandra Alena Alessa Alessandra Alessia Alexa Alexandra Alexia Alia Alica Alice Alicia Alina Alisa
Alisha Alissa Aliya Allegra Alma Alva Alwine Amalia Amanda Amelia Amelie Amina Amira Amy Ana Anabel
Anastasia Andrea Anette Angela Angelika Angelina Anica Anika Anisa Anita Anja Anke Ann Anna Annabel
Annabell Annabelle Annalena Anne Annegret Anneke Annelie Anneliese Annett Annette Anni Annica Annie
Annika Anouk Antonella Antonia Antonina Apollonia Ariana Ariane Arianna Arina Asli Asya Athina
Aurelia Aurora Ava Ayleen Aylin Ayse Azra
Bahar Barbara Bea Beate Beatrice Beatrix Begüm Belinda Bella Belma Benita Berfin Berit Berna
Bernadette Betty Bianca Bianka Bilge Birgit Birte Birthe Bonnie Britta Bruna Buket Büsra
Camilla Camille Canan Cansu Cara Caren Carina Carla Carlotta Carmen Carola Carolin Carolina Caroline
Cassandra Catharina Celina Catherine Cathrin Cecile Cecilia Ceren Ceyda Chantal Charlott Charlotte Chayenne
Cheyenne Chiara Christa Christel Christiane Christin Christina Christine Cindy Claire Clara Claudia
Clementine Colette Conny Constanze Cora Corinna Cornelia Cosima Cristina Cynthia
Dagmar Dalia Damaris Dana Daniela Danielle Daria Darja Deborah Defne Delia Delphine Denise Derya
Diana Diane Dilara Dilay Dilek Dina Dinah Doris Dorothea Dorothee Dörte Dua
Ebru Ecrin Eda Edda Edeltraud Edina Edith Ekaterina Ela Elaine Elanur Elena Eleni Eleonora Eleonore
Elfriede Eliana Elif Elin Elina Elisa Elisabeth Elise Eliza Elizabeth Elke Ella Ellen Elli Ellie
Elly Elma Elsa Else Elvira Emel Emely Emilia Emilie Emily Emine Emma Emmi Emmy Enie Enisa Enna Erna
Ernestine Esma Esra Estelle Esther Eva Evelin Eveline Evelyn Evi
Fabienne Fadime Fanny Fatima Fatma Felicia Felicitas Femke Fenja Feride Fiene Filiz Finja Finnja
Fiona Flora Florentina Florentine Franka Franziska Frauke Freya Frida Frieda Friederike Fritzi
Gabriela Gabriele Galina Gamze Gesa Gesine Gianna Gina Gisela Giulia Giuliana Greta Gretchen Grete
Gudrun Gül Gülay Gülsüm Gunda Gundula
Hafsa Hana Hanna Hannah Hanne Hannelore Hanni Hatice Hava Hedi Hedwig Heide Heidi Heike Helen Helena
Helene Helga Helma Helmi Henriette Henrike Hermine Hilda Hilde Hildegard Hira Hülya
Ida Ilayda Ilka Ilona Ilse Imke Ina Ines Inga Inge Ingeborg Ingrid Insa Ipek Irene Irina Iris Irma
Isabel Isabell Isabella Isabelle Iva Ivana Ivonne
Jacqueline Jana Jane Janet Janette Janin Janina Janine Janna Jantje Jara Jasmin Jasmina Jasmine
Jella Jenna Jennifer Jenny Jessica Jessika Jette Jil Jill Joana Joanna Johanna Jolanda Jolie Jolina
Josefine Josephine Josie Joy Judith Jule Julia Juliana Juliane Julie Julija Julika Juliette Justine
Jutta
Kaja Kamila Kara Karen Karin Karina Karla Karolin Karolina Karoline Kassandra Katarina Katarzyna
Kate Katharina Kathleen Kathrin Katja Katrin Kerstin Kiara Kira Kirsten Klara Klaudia Konstanze
Kordula Korinna Kristin Kristina Kyra
Lana Lara Larissa Laura Lavinia Lea Leah Leana Leandra Lena Lene Leni Lenja Lenya Leona Leoni Leonie
Leonora Leslie Leticia Levke Leyla Lia Liana Lianne Lida Lidia Lieke Liese Lieselotte Lili Lilia
Liliana Lilith Lilli Lillian Lilly Lily Lina Linda Line Linn Linnea Lioba Lisa Lisbeth Lise
Liselotte Liv Livia Lotta Lotte Louisa Louise Luana Lucia Lucie Lucinda Lucy Ludmilla Luisa Luise
Luna Lydia Lyn Lynn
Madeleine Madita Magda Magdalena Maike Maila Mailin Maira Maja Malea Malena Malia Malin Malina Malou
Mandy Manon Manuela Mara Marah Mareike Marei Maren Marit Margarete Margarethe Margareta Margit Margot
Maria Mariam Mariana Marie Mariella Marika Marina Marion Marisa Marita Maritta Marla Marleen Marlen
Marlene Marlies Marta Martha Martina Mary Mascha Mathea Mathilda Mathilde Matilda Maya Mayra Medina Meike
Melanie Melek Melina Melinda Melis Melisa Melissa Meltem Merle Merve Meryem Mia Michaela Michelle
Mieke Mila Milena Milla Mina Mira Miriam Mirja Mirjam Mona Monika Monique Morgane Muriel Mylene
Myriam
Nadeschda Nadia Nadine Nadja Naemi Nahla Naila Najla Nala Nancy Naomi Narin Natalia Natalie Nathalie
Nazli Neele Nela Nele Nelly Nena Nesrin Nia Nicole Nika Nike Nila Nina Nisa Noemi Nora Norina Nour
Nuray Nurcan Nuria
Olga Olivia Ophelia Özlem
Pamela Paola Patricia Patrizia Paula Paulina Pauline Peggy Penelope Perla Petra Philine Philippa Pia
Pina Polina Priscilla
Rabia Rafaela Ramona Raphaela Rebecca Rebekka Regina Regine Renate Renée Ricarda Rieke Rike Rita
Romina Romy Ronja Rosa Rosalie Rose Rosemarie Roswitha Rukiye Ruth
Sabine Sabrina Sahra Salma Samantha Samira Sandra Sanja Sara Sarah Saskia Sawsan Seda Sedef Selda
Selen Selin Selina Selma Semra Sena Serap Serena Sevda Sevgi Sevil Sibel Sibylle Sigrid Silja Silke
Silvana Silvia Simona Smilla Simone Sina Sinja Sofia Sofie Solveig Sonja Sophia Sophie Soraya Stefanie
Steffi Stella Stephanie Stine Susan Susanna Susanne Suzan Svea Svenja Sybille Sylvia Sylvie Sebnem
Tabea Talia Tamara Tamina Tanja Tara Tatjana Tea Teresa Tessa Thalia Thea Theresa Therese Theresia
Tijana Tilda Tina Tomke Tonia Tordis Tova Tuana Tugba
Ulla Ulrike Uta Ute
Valentina Valeria Valerie Vanessa Vera Verena Veronika Victoria Viktoria Vildan Vilma Viola Violetta
Virginia Vivian Viviane Vivien Vivienne
Wanda Wenke Wiebke Wilhelmine Wilhelmina Wilma Winona
Xenia
Yara Yasemin Yasmin Yelena Yeliz Yesim Yildiz Ylvi Ylvie Yvette Yvonne
Zehra Zeliha Zeynep Zoe Zoé Zoey Zsofia Zuzanna
`.split(/\s+/).filter(Boolean);

/*
 * Namen, die in deutschen Schuljahrgängen tatsächlich für beide Geschlechter
 * vergeben werden. Sie werden bewusst nicht geraten, sondern als "mehrdeutig"
 * zurückgegeben – das Tool fragt dann nach, statt eine Münze zu werfen.
 */
const TOOLHUB_VORNAMEN_UNEINDEUTIG = `
Alex Ari Ariel Charlie Chris Eike Jamie Jules Kim Luca Luka Maxime Mika Nikita Noa Nikola
Robin Sam Sascha Sasha Sidney Sydney Toni Tony
`.split(/\s+/).filter(Boolean);

const TOOLHUB_VORNAMEN = (() => {
  const woerterbuch = new Map();
  TOOLHUB_VORNAMEN_M.forEach((name) => woerterbuch.set(name.toLowerCase(), 'm'));
  TOOLHUB_VORNAMEN_W.forEach((name) => woerterbuch.set(name.toLowerCase(), 'w'));
  // Zuletzt, damit ein Name, der in beiden Listen steht, als mehrdeutig endet
  TOOLHUB_VORNAMEN_UNEINDEUTIG.forEach((name) => woerterbuch.set(name.toLowerCase(), 'beides'));
  return woerterbuch;
})();

/* ---------------------------------------------------------------------------
 * Gemerkte Korrekturen
 *
 * Was eine Lehrkraft einmal richtiggestellt hat, soll beim nächsten Jahrgang nicht
 * erneut zu klären sein. Die Korrekturen liegen im localStorage dieses Browsers und
 * gelten für alle Tools des toolhubs – der Vorname allein ist dafür kein
 * personenbeziehbares Datum.
 * ------------------------------------------------------------------------ */

const TOOLHUB_GESCHLECHT_SPEICHER = 'toolhub-geschlecht';
// Die WPB-Kurseinteilung hatte bis zur Auslagerung einen eigenen Schlüssel; die dort
// gesammelten Korrekturen werden einmalig übernommen, damit sie nicht verlorengehen.
const TOOLHUB_GESCHLECHT_SPEICHER_ALT = 'wpb_gender_overrides';

function toolhubGeschlechtKorrekturen() {
  const lesen = (schluessel) => {
    try { return JSON.parse(localStorage.getItem(schluessel) || '{}'); } catch { return {}; }
  };
  const korrekturen = lesen(TOOLHUB_GESCHLECHT_SPEICHER);
  return { ...lesen(TOOLHUB_GESCHLECHT_SPEICHER_ALT), ...korrekturen };
}

function toolhubGeschlechtMerken(vorname, geschlecht) {
  const name = String(vorname ?? '').trim().toLowerCase();
  if (!name || (geschlecht !== 'm' && geschlecht !== 'w')) return;
  const korrekturen = toolhubGeschlechtKorrekturen();
  korrekturen[name] = geschlecht;
  try { localStorage.setItem(TOOLHUB_GESCHLECHT_SPEICHER, JSON.stringify(korrekturen)); } catch { /* privates Fenster o. Ä. */ }
}

/* ---------------------------------------------------------------------------
 * Die Schätzung
 * ------------------------------------------------------------------------ */

/*
 * Liefert { geschlecht: 'm' | 'w' | null, sicherheit: 'sicher' | 'unsicher' | 'mehrdeutig' }.
 *
 *   sicher      steht so im Wörterbuch oder wurde einmal richtiggestellt
 *   unsicher    nur über die Endung erschlossen – gehört durchgesehen
 *   mehrdeutig  wird für beide Geschlechter vergeben oder ist leer; geschlecht ist null
 *
 * Doppelnamen ("Ann-Kathrin", "Ali Riza") werden Bestandteil für Bestandteil geprüft.
 * Trifft erst ein hinterer Bestandteil, bleibt es bei "unsicher": Bei "Jean-Marie"
 * entscheidet der erste Name, nicht der zweite.
 */
function toolhubGeschlechtRaten(vorname) {
  const roh = String(vorname ?? '').trim();
  if (!roh) return { geschlecht: null, sicherheit: 'mehrdeutig' };

  const korrektur = toolhubGeschlechtKorrekturen()[roh.toLowerCase()];
  if (korrektur === 'm' || korrektur === 'w') return { geschlecht: korrektur, sicherheit: 'sicher' };

  // Der ganze Name zuerst: "Anna Lena" kann als Ganzes im Wörterbuch stehen
  const teile = [roh, ...roh.split(/[\s\-]+/)].map((teil) => teil.toLowerCase()).filter(Boolean);
  for (let i = 0; i < teile.length; i++) {
    const treffer = TOOLHUB_VORNAMEN.get(teile[i]);
    if (!treffer) continue;
    if (treffer === 'beides') return { geschlecht: null, sicherheit: 'mehrdeutig' };
    // i <= 1 ist der ganze Name bzw. sein erster Bestandteil – der entscheidet
    return { geschlecht: treffer, sicherheit: i <= 1 ? 'sicher' : 'unsicher' };
  }

  /*
   * Unbekannter Name: Endung des ersten Bestandteils. Die Regel trifft im Deutschen
   * oft genug, um eine brauchbare Vorbelegung zu liefern – mehr soll sie nicht sein,
   * deshalb immer "unsicher".
   */
  const erster = teile[1] || teile[0];
  if (/(a|e|ia|ie|ika|ina|ine|itta|lin)$/.test(erster)) return { geschlecht: 'w', sicherheit: 'unsicher' };
  return { geschlecht: 'm', sicherheit: 'unsicher' };
}
