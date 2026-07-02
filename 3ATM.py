balance = 1000
print("Welcome to the ATM")

while True:
    print("")
    print("1. Show balance")
    print("2. Deposit")
    print("3. Withdraw")
    print("4. Exit")

    choice = input("Enter your choice: ")

    if choice == "1":
        print("Your balance is $" + str(balance))

    elif choice == "2":
        amount_text = input("Enter deposit amount: ")
        valid = True
        if amount_text == "":
            valid = False
        else:
            for ch in amount_text:
                if ch not in "0123456789":
                    valid = False
        if valid:
            amount = int(amount_text)
            if amount > 0:
                if amount % 100 == 0:
                    balance = balance + amount
                    print("Deposit done")
                    print("Your new balance is $" + str(balance))
                else:
                    print("Amount must be a multiple of 100")
            else:
                print("Amount must be more than 0")
        else:
            print("Please enter numbers only")

    elif choice == "3":
        amount_text = input("Enter withdraw amount: ")
        valid = True
        if amount_text == "":
            valid = False
        else:
            for ch in amount_text:
                if ch not in "0123456789":
                    valid = False
        if valid:
            amount = int(amount_text)
            if amount > 0:
                if amount % 100 == 0:
                    if balance - amount >= 100:
                        balance = balance - amount
                        print("Please take your cash")
                        print("Your new balance is $" + str(balance))
                    else:
                        print("You must keep at least $100 in account")
                else:
                    print("Amount must be a multiple of 100")
            else:
                print("Amount must be more than 0")
        else:
            print("Please enter numbers only")

    elif choice == "4":
        print("Goodbye")
        break

    else:
        print("Wrong choice, try again")
