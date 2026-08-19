import os, sys, importlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
srv = importlib.import_module("server")


def approx(a, b, tol=0.02):
    return abs(a - b) <= tol


def test_detect_roll_vs_substrate():
    assert srv._detect_media_category('54"X50YD ORAJET 3641M MATTE WHITE') == "roll"
    assert srv._detect_media_category('54"X100FT GF 226 6MIL WALLMARK') == "roll"
    assert srv._detect_media_category('48"X96" 3MM HD MAX-METAL SLVR MIR/PMD') == "substrate"
    assert srv._detect_media_category('60"X120" ACM PANEL') == "substrate"


def test_roll_yd_conversion():
    # 54"X50YD ORAJET, qty 1, total 215.72 -> 675 ft², $0.3196/ft²
    uc, stock, size, extra, mods, label = srv._import_line_spec(
        "roll", 1, "", '54"X50YD ORAJET 3641M MATTE WHITE', 215.72, 215.72, 1)
    assert approx(stock, 675.0)
    assert approx(uc, 0.3196, 0.001)
    assert extra["roll_width"] == 54.0
    assert extra["printable_width"] == 52.0
    assert extra["roll_cost"] == 215.72
    assert mods == ["large-format"]
    assert label == "ft²"


def test_roll_multi_qty_and_ft():
    # BRITELINE LAM qty 2, total 526.56 -> 2*675=1350 ft², roll_cost 263.28
    uc, stock, size, extra, mods, label = srv._import_line_spec(
        "roll", 2, "", '54"X50YD BRITELINE GC LUS LAM', 526.56, 263.28, 1)
    assert approx(stock, 1350.0)
    assert extra["roll_cost"] == 263.28
    assert extra["material_type"] == "laminate"
    # 100FT roll
    uc2, stock2, size2, extra2, _, _ = srv._import_line_spec(
        "roll", 1, "", '54"X100FT GF 226 6MIL WALLMARK', 354.87, 390.0, 1)
    assert approx(stock2, 450.0)  # (54/12)*100 = 450
    assert approx(uc2, 354.87 / 450.0, 0.001)


def test_substrate_sheet():
    # 48"X96" MAX-METAL qty1 total 225.53 -> area 32 ft², $/ft²=7.0478, stock 1 sheet
    uc, stock, size, extra, mods, label = srv._import_line_spec(
        "substrate", 1, "", '48"X96" 3MM HD MAX-METAL SLVR MIR/PMD', 225.53, 225.53, 1)
    assert stock == 1
    assert approx(extra["sheet_area_sqft"], 32.0)
    assert approx(uc, 225.53 / 32.0, 0.001)
    assert approx(extra["sheet_price"], 225.53)
    assert size == "4x8"
    assert extra["sheet_width"] == 48.0 and extra["sheet_height"] == 96.0
    assert set(mods) == {"direct-print", "laser", "channel-letters"}
    assert label == "sheets"


def test_substrate_size_labels():
    assert srv._sheet_size_label(48, 96) == "4x8"
    assert srv._sheet_size_label(96, 48) == "4x8"
    assert srv._sheet_size_label(60, 120) == "5x10"
    assert srv._sheet_size_label(24, 18) == "24x18"


def test_paper_not_misdetected_as_substrate():
    # Alfa paper sheets are inch x inch but SMALL -> must NOT be substrate (bug fix)
    assert srv._detect_media_category('18"x12" 100lb Digital Copy Cover FSC (Lynx 83.08M 270gsm)') == ""
    assert srv._detect_media_category('12"x18" 100 lb Digital White Text (Lynx 45.47M 148gsm)') == ""
    # large rigid sheets ARE substrate even without keywords
    assert srv._detect_media_category('48"X96" panel') == "substrate"
    assert srv._detect_media_category('60"X120" board') == "substrate"


def test_generic_paper_still_works():
    # Alfa-style: qty 0.4 (M sheets) x mult 1000, total 101.60 -> 400 sheets, $0.254
    uc, stock, size, extra, mods, label = srv._import_line_spec(
        "paper", 0.4, "12x18", '12"x18" 100 lb Digital White', 101.60, 254.0, 1000)
    assert approx(stock, 400.0)
    assert approx(uc, 0.254, 0.001)
    assert size == "12x18"
    assert extra == {}
