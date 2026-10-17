// Pestaña «Portadas»: rejilla con las portadas de los discos y canciones del libro y, al pulsar
// una, ficha lateral con la portada, la foto del artista, los textos de Last.fm, enlaces a los
// servicios que Wikidata conoce del artista y los vídeos de todo lo que el libro cita de él.
// Es el mismo fichero en todas las webs de Music_Books: cada app.js lo llama con Portadas({…}).
// Los datos (window.<ESPACIO>_COVERS) los genera tools/covers.py desde la base común music.db.
window.Portadas = function (cfg) {
  const { all, FAMILIES, data, esc, trackHtml, togglePlayer, open, matches, isKey, where, YT } = cfg;
  const D = data || { r: {}, a: {} };
  const $ = (s) => document.querySelector(s);
  const box = $('#covers');

  // Iconos de Simple Icons (CC0, simple-icons@13.21.0): [color de marca, trazado 24×24].
  const ICONS = {
    applemusic: ['#FA243C', 'M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z'],
    bandcamp: ['#408294', 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z'],
    discogs: ['#333333', 'M1.7422 11.982c0-5.6682 4.61-10.2782 10.2758-10.2782 1.8238 0 3.5372.48 5.0251 1.3175l.8135-1.4879C16.1768.588 14.2474.036 12.1908.0024h-.1944C5.4091.0144.072 5.3107 0 11.886v.1152c.0072 3.4389 1.4567 6.5345 3.7748 8.7207l1.1855-1.2814c-1.9798-1.8743-3.218-4.526-3.218-7.4585zM20.362 3.4053l-1.1543 1.2406c1.903 1.867 3.0885 4.4636 3.0885 7.3361 0 5.6658-4.61 10.2758-10.2758 10.2758-1.783 0-3.4605-.456-4.922-1.2575l-.8542 1.5214c1.7086.9384 3.6692 1.4735 5.7546 1.4759C18.6245 23.9976 24 18.6246 24 11.9988c-.0048-3.3717-1.399-6.4146-3.638-8.5935zM1.963 11.982c0 2.8701 1.2119 5.4619 3.146 7.2953l1.1808-1.2767c-1.591-1.5166-2.587-3.6524-2.587-6.0186 0-4.586 3.7293-8.3152 8.3152-8.3152 1.483 0 2.875.3912 4.082 1.0751l.8351-1.5262C15.481 2.395 13.8034 1.927 12.018 1.927 6.4746 1.9246 1.963 6.4362 1.963 11.982zm18.3702 0c0 4.586-3.7293 8.3152-8.3152 8.3152-1.4327 0-2.7837-.3648-3.962-1.0055l-.852 1.5166c1.4303.7823 3.0718 1.2287 4.814 1.2287 5.5434 0 10.055-4.5116 10.055-10.055 0-2.8077-1.1567-5.3467-3.0165-7.1729l-1.183 1.2743c1.519 1.507 2.4597 3.5924 2.4597 5.8986zm-1.9486 0c0 3.5109-2.8558 6.3642-6.3642 6.3642a6.3286 6.3286 0 01-3.0069-.756l-.8471 1.507c1.147.624 2.4597.9768 3.854.9768 4.4636 0 8.0944-3.6308 8.0944-8.0944 0-2.239-.9143-4.2692-2.3902-5.7378l-1.1783 1.267c1.1351 1.152 1.8383 2.731 1.8383 4.4732zm-14.4586 0c0 2.3014.9671 4.382 2.515 5.8578l1.1734-1.2695c-1.207-1.159-1.9606-2.786-1.9606-4.5883 0-3.5108 2.8557-6.3642 6.3642-6.3642 1.1423 0 2.215.3048 3.1437.8352l.8303-1.5167c-1.1759-.6647-2.5317-1.0487-3.974-1.0487-4.4612 0-8.092 3.6308-8.092 8.0944zm12.5292 0c0 2.4502-1.987 4.4372-4.4372 4.4372a4.4192 4.4192 0 01-2.0614-.5088l-.8351 1.4879a6.1135 6.1135 0 002.8965.727c3.3885 0 6.1434-2.7548 6.1434-6.1433 0-1.6774-.6767-3.1989-1.7686-4.3076l-1.1615 1.2503c.7559.7967 1.2239 1.8718 1.2239 3.0573zm-10.5806 0c0 1.7374.7247 3.3069 1.8886 4.4252L8.92 15.1569l.0144.0144c-.8351-.8063-1.3559-1.9366-1.3559-3.1869 0-2.4502 1.9846-4.4372 4.4372-4.4372.8087 0 1.5646.2184 2.2174.5976l.8207-1.4975a6.097 6.097 0 00-3.0381-.8063c-3.3837-.0048-6.141 2.7525-6.141 6.141zm6.681 0c0 .2952-.2424.5351-.5376.5351-.2952 0-.5375-.24-.5375-.5351 0-.2976.24-.5375.5375-.5375.2952 0 .5375.24.5375.5375zm-3.9405 0c0-1.879 1.5239-3.4029 3.4005-3.4029 1.879 0 3.4005 1.5215 3.4005 3.4029 0 1.879-1.5239 3.4005-3.4005 3.4005S8.6151 13.861 8.6151 11.982zm.1488 0c.0048 1.7974 1.4567 3.2493 3.2517 3.2517 1.795 0 3.254-1.4567 3.254-3.2517-.0023-1.7974-1.4566-3.2517-3.254-3.254-1.795 0-3.2517 1.4566-3.2517 3.254Z'],
    facebook: ['#0866FF', 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'],
    genius: ['#FFFF64', 'M0 6.827c0 2.164.79 4.133 2.167 5.51.393.393.786.59 1.18.983h.195c.197 0 .196-.196.196-.196-.393-.787-.588-1.77-.588-2.754 0-2.164.982-4.329 2.36-5.706V1.518c0-.197-.197-.196-.197-.196h-2.95C.789 2.896 0 4.664 0 6.827zm2.559 12.59c2.36 2.164 5.31 3.343 8.851 3.343 7.082 0 12.59-5.702 12.59-12.586 0-3.344-1.378-6.492-3.542-8.656h-.196c0-.197-.196 0-.196 0 .59 1.574.983 3.147.983 4.918 0 7.278-5.902 13.373-13.377 13.373-1.77 0-3.344-.393-4.917-.983-.197 0-.196.199-.196.395zm5.9-11.998c0 .59.395 1.178.788 1.571h.392c3.54 1.18 4.722-.193 4.722-1.767V5.056c0-.196.196-.196.196-.196h.787c.197 0 .196-.196.196-.196-.196-1.18-.784-2.358-1.571-3.342h-2.363c0-.197-.196 0-.196.196v2.95c0 1.574-1.18 2.754-2.754 2.951 0-.197-.196 0-.196 0z'],
    imdb: ['#F5C518', 'M22.3781 0H1.6218C.7411.0583.0587.7437.0018 1.5953l-.001 20.783c.0585.8761.7125 1.543 1.5559 1.6191A.337.337 0 0 0 1.6016 24h20.7971a.4579.4579 0 0 0 .0437-.002c.8727-.0768 1.5568-.8271 1.5568-1.7085V1.7098c0-.8914-.696-1.6416-1.584-1.7078A.3294.3294 0 0 0 22.3781 0zm0 .496a1.2144 1.2144 0 0 1 1.1252 1.2139v20.5797c0 .6377-.4875 1.1602-1.1045 1.2145H1.6016c-.5967-.0543-1.0645-.5297-1.1053-1.1258V1.6284C.5371 1.0185 1.0184.5364 1.6217.496h20.7564zM4.7954 8.2603v7.3636H2.8899V8.2603h1.9055zm6.5367 0v7.3636H9.6707v-4.9704l-.6711 4.9704H7.813l-.6986-4.8618-.0066 4.8618h-1.668V8.2603h2.468c.0748.4476.1492.9694.2307 1.5734l.2712 1.8713.4407-3.4447h2.4817zm2.9772 1.3289c.0742.0404.122.108.1417.2034.0279.0953.0345.3118.0345.6442v2.8548c0 .4881-.0345.7867-.0955.8954-.0609.1152-.2304.1695-.5018.1695V9.5211c.204 0 .3457.0205.4211.0681zm-.0211 6.0347c.4543 0 .8006-.0265 1.0245-.0742.2304-.0477.4204-.1357.5694-.2648.1556-.1218.2642-.298.3251-.5219.0611-.2238.1021-.6648.1021-1.3224v-2.5832c0-.6986-.0271-1.1668-.0742-1.4039-.041-.237-.1431-.4543-.3126-.6437-.1695-.1973-.4198-.3324-.7456-.421-.3191-.0808-.8542-.1285-1.7694-.1285h-1.4244v7.3636h2.3051zm5.14-1.7827c0 .3523-.0199.5762-.0544.6708-.033.0947-.1894.1424-.3046.1424-.1086 0-.19-.0477-.2238-.1351-.041-.0887-.0609-.2986-.0609-.6238v-1.9469c0-.3324.0199-.5423.0543-.6237.0338-.0808.1086-.122.2171-.122.1153 0 .2709.0412.3114.1425.041.0947.0609.2986.0609.6032v1.8926zm-2.4747-5.5809v7.3636h1.7157l.1152-.4675c.1556.1894.3251.3324.5152.4271.1828.0881.4608.1357.678.1357.3047 0 .5629-.0748.7802-.237.2165-.1562.3589-.3462.4198-.5628.0543-.2173.0887-.543.0887-.9841v-2.0675c0-.4409-.0139-.7324-.0344-.8681-.0199-.1357-.0742-.2781-.1695-.4204-.1021-.1425-.2437-.251-.4272-.3325-.1834-.0742-.3999-.1152-.6576-.1152-.2172 0-.4952.0477-.6846.1285-.1835.0887-.353.2238-.5086.4007V8.2603h-1.8309z'],
    instagram: ['#FF0069', 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077'],
    lastdotfm: ['#D51007', 'M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z'],
    musicbrainz: ['#BA478F', 'M11.582 0L1.418 5.832v12.336L11.582 24V10.01L7.1 12.668v3.664c.01.111.01.225 0 .336-.103.435-.54.804-1 1.111-.802.537-1.752.509-2.166-.111-.413-.62-.141-1.631.666-2.168.384-.28.863-.399 1.334-.332V6.619c0-.154.134-.252.226-.308L11.582 3zm.836 0v6.162c.574.03 1.14.16 1.668.387a2.225 2.225 0 0 0 1.656-.717 1.02 1.02 0 1 1 1.832-.803l.004.006a1.022 1.022 0 0 1-1.295 1.197c-.34.403-.792.698-1.297.85.34.263.641.576.891.928a1.04 1.04 0 0 1 .777.125c.768.486.568 1.657-.318 1.857-.886.2-1.574-.77-1.09-1.539.02-.03.042-.06.065-.09a3.598 3.598 0 0 0-1.436-1.166 4.142 4.142 0 0 0-1.457-.369v4.01c.855.06 1.256.493 1.555.834.227.256.356.39.578.402.323.018.568.008.806 0a5.44 5.44 0 0 1 .895.022c.94-.017 1.272-.226 1.605-.446a2.533 2.533 0 0 1 1.131-.463 1.027 1.027 0 0 1 .12-.263 1.04 1.04 0 0 1 .105-.137c.023-.025.047-.044.07-.066a4.775 4.775 0 0 1 0-2.405l-.012-.01a1.02 1.02 0 1 1 .692.272h-.057a4.288 4.288 0 0 0 0 1.877h.063a1.02 1.02 0 1 1-.545 1.883l-.047-.033a1 1 0 0 1-.352-.442 1.885 1.885 0 0 0-.814.354 3.03 3.03 0 0 1-.703.365c.757.555 1.772 1.6 2.199 2.299a1.03 1.03 0 0 1 .256-.033 1.02 1.02 0 1 1-.545 1.88l-.047-.03a1.017 1.017 0 0 1-.27-1.376.72.72 0 0 1 .051-.072c-.445-.775-2.026-2.28-2.46-2.387a4.037 4.037 0 0 0-1.31-.117c-.24.008-.513.018-.866 0-.515-.027-.783-.333-1.043-.629-.26-.296-.51-.56-1.055-.611V18.5a1.877 1.877 0 0 0 .426-.135.333.333 0 0 1 .058-.027c.56-.267 1.421-.91 2.096-2.447a1.02 1.02 0 0 1-.27-1.344 1.02 1.02 0 1 1 .915 1.54 6.273 6.273 0 0 1-1.432 2.136 1.785 1.785 0 0 1 .691.306.667.667 0 0 0 .37.168 3.31 3.31 0 0 0 .888-.222 1.02 1.02 0 0 1 1.787-.79v-.005a1.02 1.02 0 0 1-.773 1.683 1.022 1.022 0 0 1-.719-.287 3.935 3.935 0 0 1-1.168.287h-.05a1.313 1.313 0 0 1-.71-.275c-.262-.177-.51-.345-1.402-.12a2.098 2.098 0 0 1-.707.2V24l10.164-5.832V5.832zm4.154 4.904a.352.352 0 0 0-.197.639l.018.01c.163.1.378.053.484-.108v-.002a.352.352 0 0 0-.303-.539zm-4.99 1.928L7.082 9.5v2l4.5-2.668zm8.385.38a.352.352 0 0 0-.295.165v.002a.35.35 0 0 0 .096.473l.013.01a.357.357 0 0 0 .487-.108.352.352 0 0 0-.301-.541zM16.09 8.647a.352.352 0 0 0-.277.163.355.355 0 0 0 .296.54c.482 0 .463-.73-.02-.703zm3.877 2.477a.352.352 0 0 0-.295.164.35.35 0 0 0 .094.475l.015.01a.357.357 0 0 0 .485-.11.352.352 0 0 0-.3-.539zm-4.375 3.594a.352.352 0 0 0-.291.172.35.35 0 0 0-.04.265.352.352 0 1 0 .33-.437zm4.375.789a.352.352 0 0 0-.295.164v.002a.352.352 0 0 0 .094.473l.015.01a.357.357 0 0 0 .485-.108.352.352 0 0 0-.3-.54zm-2.803 2.488v.002a.347.347 0 0 0-.223.084.352.352 0 0 0 .23.62.347.347 0 0 0 .23-.085.348.348 0 0 0 .12-.24.353.353 0 0 0-.35-.38.347.347 0 0 0-.007 0Z'],
    songkick: ['#F80046', 'M6.55 18.779c-1.855 0-3.372-.339-4.598-1.602l1.92-1.908c.63.631 1.74.853 2.715.853 1.186 0 1.739-.391 1.739-1.089 0-.291-.06-.529-.239-.717-.15-.154-.404-.273-.795-.324l-1.455-.205c-1.064-.152-1.891-.51-2.43-1.072-.555-.578-.84-1.395-.84-2.434C2.536 8.066 4.2 6.45 6.96 6.45c1.74 0 3.048.407 4.086 1.448L9.171 9.77c-.765-.766-1.77-.715-2.295-.715-1.039 0-1.465.597-1.465 1.125 0 .152.051.375.24.561.15.153.404.307.832.359l1.467.203c1.09.153 1.875.495 2.385 1.005.645.63.9 1.53.9 2.655 0 2.47-2.127 3.819-4.68 3.819l-.005-.003zM20.813 2.651C19.178 1.432 17.37.612 15.089.237v10.875l3.261-4.539h3.565l-4.095 5.72s.944 1.51 1.515 2.405c.586.899 1.139 1.14 1.965 1.14h.57v2.806h-.872c-1.812 0-2.9-.33-3.72-1.575-.504-.811-2.175-3.436-2.175-3.436v4.995H12.12V-.001H12c-3.852 0-6.509.931-8.811 2.652C-.132 5.137.001 8.451.001 11.997c0 3.547-.133 6.867 3.188 9.352C5.491 23.074 8.148 24 12 24s6.51-.927 8.812-2.651C24.131 18.865 24 15.544 24 11.997c0-3.546.132-6.859-3.188-9.346h.001z'],
    soundcloud: ['#FF5500', 'M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z'],
    spotify: ['#1ED760', 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'],
    tidal: ['#000000', 'M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l-4.004 4.004 4.004 4.004 4.004-4.004L12.012 12l4.004-4.004-4.004-4.004zM16.042 7.996l3.979-3.979L24 7.996l-3.979 3.979z'],
    wikidata: ['#006699', 'M0 4.583v14.833h.865V4.583zm1.788 0v14.833h2.653V4.583zm3.518 0v14.832H7.96V4.583zm3.547 0v14.834h.866V4.583zm1.789 0v14.833h.865V4.583zm1.759 0v14.834h2.653V4.583zm3.518 0v14.834h.923V4.583zm1.788 0v14.833h2.653V4.583zm3.64 0v14.834h.865V4.583zm1.788 0v14.834H24V4.583Z'],
    wikipedia: ['#000000', 'M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z'],
    x: ['#000000', 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'],
    youtube: ['#FF0000', 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'],
  };
  // Identificadores de Wikidata → servicio. Los que no tienen icono llevan unas siglas.
  const PROPS = [
    ['P856', 'Web oficial', null, (v) => v],
    ['wp-es', 'Wikipedia (español)', 'wikipedia', (v) => v],
    ['wp-en', 'Wikipedia (inglés)', 'wikipedia', (v) => v],
    ['P1902', 'Spotify', 'spotify', (v) => 'https://open.spotify.com/artist/' + v],
    ['P2850', 'Apple Music', 'applemusic', (v) => 'https://music.apple.com/us/artist/' + v],
    ['P2722', 'Deezer', 'Dz', (v) => 'https://www.deezer.com/artist/' + v],
    ['P4576', 'TIDAL', 'tidal', (v) => 'https://tidal.com/browse/artist/' + v],
    ['P3283', 'Bandcamp', 'bandcamp', (v) => `https://${v}.bandcamp.com`],
    ['P3040', 'SoundCloud', 'soundcloud', (v) => 'https://soundcloud.com/' + v],
    ['P2397', 'Canal de YouTube', 'youtube', (v) => 'https://www.youtube.com/channel/' + v],
    ['P3192', 'Last.fm', 'lastdotfm', (v) => 'https://www.last.fm/music/' + v],
    ['P1953', 'Discogs', 'discogs', (v) => 'https://www.discogs.com/artist/' + v],
    ['P434', 'MusicBrainz', 'musicbrainz', (v) => 'https://musicbrainz.org/artist/' + v],
    ['P1728', 'AllMusic', 'AM', (v) => 'https://www.allmusic.com/artist/' + v],
    ['P5404', 'Rate Your Music', 'RYM', (v) => 'https://rateyourmusic.com/artist/' + v],
    ['P2373', 'Genius', 'genius', (v) => 'https://genius.com/artists/' + v],
    ['P3478', 'Songkick', 'songkick', (v) => 'https://www.songkick.com/artists/' + v],
    ['P345', 'IMDb', 'imdb', (v) => `https://www.imdb.com/name/${v}/`],
    ['P2013', 'Facebook', 'facebook', (v) => 'https://www.facebook.com/' + v],
    ['P2003', 'Instagram', 'instagram', (v) => `https://www.instagram.com/${v}/`],
    ['P2002', 'X (Twitter)', 'x', (v) => 'https://x.com/' + v],
    ['wd', 'Wikidata', 'wikidata', (v) => 'https://www.wikidata.org/wiki/' + v],
  ];
  const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c3 3 4 6.5 4 10s-1 7-4 10c-3-3-4-6.5-4-10s1-7 4-10z"/></svg>';
  function icon(slug) {
    if (!slug) return GLOBE;
    const ic = ICONS[slug];
    return ic ? `<svg viewBox="0 0 24 24"><path d="${ic[1]}"/></svg>` : `<b>${slug}</b>`;
  }
  function services(A) {
    const vals = { ...(A.links || {}), wd: A.wd };
    if (A.wp) for (const l in A.wp) vals['wp-' + l] = A.wp[l];
    if (!vals.P3192 && A.url) vals.P3192 = A.url.replace('https://www.last.fm/music/', '');
    return PROPS.filter(([p]) => vals[p]).map(([p, name, slug, url]) => {
      const c = ICONS[slug] ? ICONS[slug][0] : '';
      return `<a class="svc" href="${esc(url(vals[p]))}" target="_blank" rel="noopener" title="${esc(name)}"${c ? ` style="--brand:${c}"` : ''}>${icon(slug)}</a>`;
    }).join('');
  }

  // Un disco o canción por artista y título, con las escenas o géneros donde aparece.
  const rel = new Map();
  for (const g of all) for (const t of g.tracks) {
    const k = `${t.a}|${t.t}`.toLowerCase();
    if (!rel.has(k)) rel.set(k, { ...t, key: `${t.a}|${t.t}`, lk: k, genres: [], chs: [...(t.chs || [])] });
    const r = rel.get(k);
    if (!r.genres.includes(g)) r.genres.push(g);
    if (isKey(t)) r.isKey = true;
    for (const c of t.chs || []) if (!r.chs.includes(c)) r.chs.push(c);
  }
  const info = (r) => D.r[r.key] || {};
  const byYear = (a, b) => (a.y || 9999) - (b.y || 9999) || a.a.localeCompare(b.a, 'es') || a.t.localeCompare(b.t, 'es');
  const byName = (a, b) => a.a.localeCompare(b.a, 'es') || (a.y || 9999) - (b.y || 9999);

  // Las canciones de un mismo disco (misma portada y artista, o el mismo álbum según Last.fm)
  // forman un grupo: una sola portada en la rejilla y, en la ficha, un vídeo por canción.
  const nkey = (s) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const byIdent = new Map(), relGroup = new Map();
  for (const r of [...rel.values()].sort(byYear)) {
    const C = info(r);
    const album = C.kind === 'album' ? r.t : C.album || '';
    const ids = [C.img && `${r.a}|img|${C.img}`, album && `${r.a}|al|${nkey(album)}`].filter(Boolean);
    const gr = ids.map((i) => byIdent.get(i)).find(Boolean) || { items: [] };
    for (const i of ids) if (!byIdent.has(i)) byIdent.set(i, gr);
    gr.items.push(r);
    relGroup.set(r.lk, gr);
  }
  const groups = new Map();
  const byArtist = new Map();
  for (const gr of new Set(relGroup.values())) {
    // Primero el álbum, si el libro lo cita como tal; luego las canciones por año.
    gr.items.sort((a, b) => (info(b).kind === 'album') - (info(a).kind === 'album') || byYear(a, b));
    const head = gr.items[0], H = info(head);
    Object.assign(gr, {
      head, id: head.lk, key: head.key, a: head.a,
      t: gr.items.length > 1 && H.kind !== 'album' && H.album ? H.album : head.t,
      y: Math.min(...gr.items.map((r) => r.y || 9999)),
      img: gr.items.map((r) => info(r).img).find(Boolean) || '',
      isKey: gr.items.some((r) => r.isKey),
      genres: [...new Set(gr.items.flatMap((r) => r.genres))],
    });
    if (gr.y === 9999) gr.y = undefined;
    groups.set(gr.id, gr);
    if (!byArtist.has(gr.a)) byArtist.set(gr.a, []);
    byArtist.get(gr.a).push(gr);
  }
  const big = (url) => url.replace(/\/i\/u\/\d+x\d+\//, '/i/u/770x0/');
  const color = (g) => FAMILIES[g.genres[0].family].color;
  const ph = (g) => `<span class="ph" style="--c:${color(g)}"><b>${esc(g.a)}</b>${esc(g.t)}</span>`;

  const st = { sort: 'y', key: false, img: false };
  const tile = (g) => `<button class="cv${g.isKey ? ' key' : ''}" data-k="${esc(g.id)}" title="${esc(g.a)} — ${esc(g.t)}${g.y ? ` (${g.y})` : ''}${g.items.length > 1 ? '\n' + g.items.map((r) => '· ' + r.t).join('\n') : ''}">${g.img ? `<img loading="lazy" src="${esc(g.img)}" alt="">` : ph(g)}<span class="cap"><b>${esc(g.a)}</b>${esc(g.t)}${g.y ? ` · ${g.y}` : ''}</span>${g.isKey ? '<i class="star">★</i>' : ''}${g.items.length > 1 ? `<i class="cnt">${g.items.length}</i>` : ''}</button>`;

  function render() {
    const list = [...groups.values()].filter((g) => (!st.img || g.img) && g.items.some((r) => (!st.key || r.isKey) && r.genres.some((x) => matches(x, r))));
    list.sort(st.sort === 'y' ? byYear : byName);
    const n = list.reduce((s, g) => s + g.items.length, 0);
    let html = `<div class="dbar"><span>${list.length} portadas · ${n} discos y canciones</span>
      <label>Orden <select data-sort><option value="y">año</option><option value="a"${st.sort === 'a' ? ' selected' : ''}>artista</option></select></label>
      <label><input type="checkbox" data-key${st.key ? ' checked' : ''}> ${esc(cfg.keyLabel || 'Solo destacados ★')}</label>
      <label><input type="checkbox" data-img${st.img ? ' checked' : ''}> Solo con portada</label></div>`;
    if (!list.length) html += '<p class="hint">Nada coincide con la búsqueda.</p>';
    // Ordenado por año: un bloque por década; por artista: un bloque por inicial.
    const head = st.sort === 'y' ? (g) => (g.y ? (g.y < 1950 ? 'Antes de 1950' : `Años ${String(Math.floor(g.y / 10) * 10).slice(2)}`) : 'Sin año')
      : (g) => (g.a.replace(/^(the|los|las|la|el) /i, '')[0] || '#').toUpperCase();
    let cur = null;
    for (const g of list) {
      const h = head(g);
      if (h !== cur) { html += `${cur === null ? '' : '</div>'}<h2>${esc(h)}</h2><div class="cgrid">`; cur = h; }
      html += tile(g);
    }
    box.innerHTML = html + (cur === null ? '' : '</div>');
  }
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-sort]')) st.sort = e.target.value;
    else if (e.target.matches('[data-key]')) st.key = e.target.checked;
    else if (e.target.matches('[data-img]')) st.img = e.target.checked;
    render();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.cv');
    if (b) openCover(b.dataset.k);
  });
  // Una portada que ya no existe en el servidor se sustituye por el rótulo de color.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.closest('.cv, .cvpics')) return;
    const g = groups.get(img.closest('[data-k]')?.dataset.k);
    if (g) img.outerHTML = ph(g); else img.remove();
  }, true);

  function lfmText(x, what) {
    if (!x || !x.wiki && !x.bio) return '';
    const txt = x.wiki || x.bio;
    return `<div class="lfm">${esc(txt).replace(/\n\s*\n/g, '</p><p>').replace(/^/, '<p>')}</p>
      <div class="fine">${x.lang === 'en' ? 'Texto de Last.fm en inglés (no hay versión en español)' : 'Texto de Last.fm'}${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">${what} en Last.fm ↗</a>` : ''}</div></div>`;
  }
  // Abierta con doble clic (file://) YouTube rechaza los vídeos incrustados (error 153, no hay
  // «referrer»): entonces se muestra la miniatura con enlace; servida por HTTP, el reproductor.
  const video = (v) => location.protocol === 'file:'
    ? `<a class="player yt" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt=""><span>▶</span></a>`
    : `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}" title="${esc(v.title)}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe></div>`;
  const videoOr = (r) => YT[r.key] ? video(YT[r.key])
    : `<p class="fine"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(r.a + ' ' + r.t)}" target="_blank" rel="noopener">Buscar en YouTube 🔍</a></p>`;
  const num = (n) => n ? n.toLocaleString('es-ES') : '';
  const tagsHtml = (x) => (x && x.tags && x.tags.length) ? `<div class="tags">${x.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  const chips = (gs, cls) => gs.map((g) => `<button class="${cls}" data-go="${g.id}"><i class="${cls === 'chip' ? '' : 'dot'}" style="background:${FAMILIES[g.family].color}"></i>${esc(g.name)}</button>`).join('');
  const kindOf = (r) => { const C = info(r); return C.kind === 'album' ? 'álbum' : C.kind === 'track' ? 'canción' : ''; };

  function openCover(id) {
    const g = groups.get(id);
    if (!g) return;
    const C = info(g.head), A = D.a[g.a] || {};
    const multi = g.items.length > 1;
    const kind = !multi ? (C.kind === 'album' ? 'Álbum' : C.kind === 'track' ? 'Canción' + (C.album ? ` · del disco «${esc(C.album)}»` : '') : '')
      : C.kind === 'album' ? `Álbum y ${g.items.length - 1} ${g.items.length > 2 ? 'canciones' : 'canción'} citadas` : `${g.items.length} canciones del disco`;
    const mine = (byArtist.get(g.a) || []).slice().sort(byYear);
    const cited = mine.flatMap((o) => o.items);
    // Un bloque por título del grupo: su nombre, dónde lo cita el libro y su vídeo. Si todos
    // salen en las mismas escenas y capítulos, eso se dice una sola vez, arriba.
    const place = (r) => r.genres.map((x) => x.id).join() + '|' + where(r);
    const same = g.items.every((r) => place(r) === place(g.head));
    const item = (r) => `<div class="cvitem">${multi ? `<h3>${r.isKey ? '<span class="star">★</span> ' : ''}${esc(r.t)}${r.y ? ` <span class="y">(${r.y})</span>` : ''}${kindOf(r) ? ` <span class="k">${kindOf(r)}</span>` : ''}</h3>` : ''}
      ${!same ? `<div class="gl">${chips(r.genres, 'glink')}</div>` : ''}
      ${!same && where(r) ? `<div class="fine">En el libro: ${where(r)}</div>` : ''}${videoOr(r)}</div>`;
    $('#detail').innerHTML = `
      <div class="cvpics" data-k="${esc(g.id)}">
        <figure>${g.img ? `<img src="${esc(big(g.img))}" alt="Portada">` : ph(g)}<figcaption>Portada${C.src === 'deezer' ? ' · Deezer' : g.img ? ' · Last.fm' : ''}</figcaption></figure>
        ${A.img ? `<figure class="art"><img src="${esc(A.img)}" alt="${esc(g.a)}"><figcaption>${esc(g.a)} · ${A.isrc === 'commons' ? 'Wikimedia Commons' : 'Deezer'}</figcaption></figure>` : ''}
      </div>
      <h2>${esc(g.t)}</h2>
      <div class="aka"><b>${esc(g.a)}</b>${g.y ? ` · ${g.y}` : ''}${kind ? ` · ${kind}` : ''}${!multi && g.isKey ? ` · <span class="star">★</span> ${esc(cfg.keyName || 'destacado')}` : ''}</div>
      <div class="links cvg">${chips(g.genres, 'chip')}</div>
      ${same && where(g.head) ? `<div class="fine">En el libro: ${where(g.head)}</div>` : ''}
      ${multi ? `<h4>En el libro (${g.items.length})</h4>` : ''}${g.items.map(item).join('')}
      ${C.wiki || C.tags ? `<h4>${C.kind === 'track' ? 'La canción' : 'El disco'}${multi && C.kind === 'track' ? ` «${esc(g.head.t)}»` : ''}${C.lis ? ` · ${num(C.lis)} oyentes en Last.fm` : ''}</h4>${tagsHtml(C)}${lfmText(C, C.kind === 'track' ? 'La canción' : 'El disco')}` : ''}
      <h4>${esc(g.a)}${A.lis ? ` · ${num(A.lis)} oyentes en Last.fm` : ''}</h4>
      ${services(A) ? `<div class="svcs">${services(A)}</div>` : ''}
      ${tagsHtml(A)}${lfmText(A, 'El artista')}
      ${mine.length > 1 ? `<h4>Otras portadas de ${esc(g.a)} (${mine.length - 1})</h4><div class="minis">${mine.filter((o) => o !== g).map(tile).join('')}</div>` : ''}
      ${cited.length > 1 ? `<h4>Todo lo que cita el libro de ${esc(g.a)} (${cited.length})</h4>
      <ol class="tracks">${cited.map((o) => trackHtml(o, `<span class="gl">${chips(o.genres, 'glink')}</span>`).replace('<li', g.items.includes(o) ? '<li data-cur' : '<li')).join('')}</ol>` : ''}
      <p class="fine">Portadas y textos de Last.fm (CC BY-SA) y Deezer; fotos de Wikimedia Commons o Deezer; enlaces de Wikidata. Vídeos de YouTube.</p>`;
    const det = $('#detail');
    det.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => open(b.dataset.go));
    det.querySelectorAll('.play').forEach((b) => b.onclick = () => togglePlayer(b));
    det.querySelectorAll('.minis .cv').forEach((b) => b.onclick = () => openCover(b.dataset.k));
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    $('#panel').scrollTop = 0;
    history.replaceState(null, '', '#portada=' + encodeURIComponent(g.key));
  }

  render();
  const h = decodeURIComponent(location.hash.slice(1));
  const fromHash = h.startsWith('portada=') && relGroup.get(h.slice(8).toLowerCase());
  if (fromHash) {
    document.querySelector('.views button[data-view="covers"]').click();
    openCover(fromHash.id);
  }
  // La pestaña Menciones (menciones.js) reutiliza los discos ya agrupados.
  return { render, groups, byArtist };
};
